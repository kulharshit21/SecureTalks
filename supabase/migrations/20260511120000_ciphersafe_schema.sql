-- CipherSafe Phase 1 schema: ciphertext-only messages, RLS, storage, realtime helpers.
-- Run via Supabase CLI or dashboard SQL editor.

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Profiles (discoverable fields only; no secrets)
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT username_format CHECK (
    char_length(username) >= 3
    AND username ~ '^[a-z0-9_]+$'
  )
);

CREATE INDEX profiles_username_idx ON public.profiles USING btree (lower(username));

-- -----------------------------------------------------------------------------
-- Devices & public key bundles (identity keys only on server)
-- -----------------------------------------------------------------------------
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'This device',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX devices_user_id_idx ON public.devices (user_id);

CREATE TABLE public.public_key_bundles (
  device_id UUID PRIMARY KEY REFERENCES public.devices (id) ON DELETE CASCADE,
  identity_public_key TEXT NOT NULL,
  signing_public_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT identity_public_key_nonempty CHECK (char_length(identity_public_key) > 0)
);

-- -----------------------------------------------------------------------------
-- Conversations & membership
-- -----------------------------------------------------------------------------
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users (id)
);

CREATE TABLE public.conversation_members (
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_message_id UUID,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_members_user_idx ON public.conversation_members (user_id);

-- -----------------------------------------------------------------------------
-- Messages (ciphertext + nonce only — never plaintext body)
-- -----------------------------------------------------------------------------
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE RESTRICT,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'attachment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ciphertext_nonempty CHECK (char_length(ciphertext) > 0),
  CONSTRAINT nonce_nonempty CHECK (char_length(nonce) > 0)
);

CREATE INDEX messages_conversation_created_idx
  ON public.messages (conversation_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Receipts (delivery state; no message body)
-- -----------------------------------------------------------------------------
CREATE TABLE public.message_receipts (
  message_id UUID NOT NULL REFERENCES public.messages (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'read')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX message_receipts_user_idx ON public.message_receipts (user_id);

-- Auto-create sender receipt (sent)
CREATE OR REPLACE FUNCTION public.on_message_created_sender_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender UUID;
BEGIN
  SELECT d.user_id INTO sender FROM public.devices d WHERE d.id = NEW.sender_device_id;
  IF sender IS NOT NULL THEN
    INSERT INTO public.message_receipts (message_id, user_id, status)
    VALUES (NEW.id, sender, 'sent')
    ON CONFLICT (message_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_sender_receipt
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_created_sender_receipt();

-- -----------------------------------------------------------------------------
-- Attachments metadata (blobs are ciphertext in Storage)
-- -----------------------------------------------------------------------------
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages (id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  ciphertext_sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Security / audit events (no message plaintext)
-- -----------------------------------------------------------------------------
CREATE TABLE public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX security_events_user_created_idx ON public.security_events (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- FK: last_read_message_id
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversation_members
  ADD CONSTRAINT conversation_members_last_read_fk
  FOREIGN KEY (last_read_message_id) REFERENCES public.messages (id)
  ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- New user profile bootstrap (display fields only — not for authorization)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  candidate TEXT;
  suffix INT := 0;
BEGIN
  base_username :=
    COALESCE(
      NULLIF(lower(trim(NEW.raw_user_meta_data ->> 'username')), ''),
      regexp_replace(split_part(COALESCE(NEW.email, 'user'), '@', 1), '[^a-z0-9_]', '_', 'g')
    );
  IF base_username IS NULL OR char_length(base_username) < 3 THEN
    base_username := 'user';
  END IF;
  candidate := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = candidate) LOOP
    suffix := suffix + 1;
    candidate := base_username || '_' || suffix::TEXT;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    candidate,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'display_name'), ''), split_part(COALESCE(NEW.email, 'you'), '@', 1)),
    NULLIF(trim(NEW.raw_user_meta_data ->> 'avatar_url'), '')
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Direct conversation creation (adds both members; SECURITY DEFINER)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_direct_conversation(peer_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  conv_id UUID;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF peer_user_id IS NULL OR peer_user_id = me THEN
    RAISE EXCEPTION 'invalid peer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = peer_user_id) THEN
    RAISE EXCEPTION 'peer profile missing';
  END IF;

  INSERT INTO public.conversations (kind, created_by)
  VALUES ('direct', me)
  RETURNING id INTO conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (conv_id, me), (conv_id, peer_user_id);

  RETURN conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_direct_conversation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_key_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- profiles: discoverability for username search (no emails stored here)
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- devices
CREATE POLICY devices_select_authenticated ON public.devices
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY devices_insert_own ON public.devices
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY devices_update_own ON public.devices
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY devices_delete_own ON public.devices
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- public key bundles
CREATE POLICY pkb_select_authenticated ON public.public_key_bundles
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY pkb_insert_own_device ON public.public_key_bundles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.devices d
      WHERE d.id = device_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY pkb_update_own_device ON public.public_key_bundles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.devices d
      WHERE d.id = device_id AND d.user_id = auth.uid()
    )
  );

-- conversations
CREATE POLICY conversations_select_member ON public.conversations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = id AND cm.user_id = auth.uid()
    )
  );

-- Members inserted via RPC; still allow created_by to insert shell rows if needed (unused when using RPC)
CREATE POLICY conversations_insert_creator ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- conversation_members
CREATE POLICY cm_select_member ON public.conversation_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY cm_insert_self_when_creator ON public.conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.created_by = auth.uid()
    )
  );

CREATE POLICY cm_update_own_membership ON public.conversation_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- messages
CREATE POLICY messages_select_member ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY messages_insert_sender_member ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.devices d
      WHERE d.id = sender_device_id AND d.user_id = auth.uid()
    )
  );

-- receipts
CREATE POLICY receipts_select_member ON public.message_receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY receipts_insert_self_member ON public.message_receipts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY receipts_update_own_member ON public.message_receipts
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid()
    )
  );

-- attachments
CREATE POLICY attachments_select_member ON public.attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY attachments_insert_member ON public.attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid()
    )
  );

-- security_events (own rows only)
CREATE POLICY security_events_select_own ON public.security_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY security_events_insert_own ON public.security_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Realtime: replicate ciphertext rows to members (payload remains ciphertext)
-- -----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;

-- -----------------------------------------------------------------------------
-- Storage bucket for ciphertext attachments
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  FALSE,
  52428800,
  ARRAY[
    'application/octet-stream',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY attachments_storage_insert_own_prefix ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY attachments_storage_select_via_row ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      JOIN public.messages m ON m.id = a.message_id
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE a.storage_path = name AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY attachments_storage_update_own_prefix ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY attachments_storage_delete_own_prefix ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

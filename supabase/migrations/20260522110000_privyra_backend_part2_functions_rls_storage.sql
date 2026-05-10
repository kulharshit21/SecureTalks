-- Privyra Part 2: triggers, helper functions, group crypto tables, RLS, storage, realtime.
-- Applied to linked Supabase via MCP + checked into repo.

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS title TEXT;

-- -----------------------------------------------------------------------------
-- Group symmetric epochs (same semantics as prior CipherSafe group MVP)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_session_epochs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  epoch INTEGER NOT NULL CHECK (epoch >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_by_device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE RESTRICT,
  UNIQUE (conversation_id, epoch)
);

CREATE INDEX IF NOT EXISTS group_session_epochs_conv_idx ON public.group_session_epochs (conversation_id, epoch DESC);

CREATE TABLE IF NOT EXISTS public.group_key_wraps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epoch_id UUID NOT NULL REFERENCES public.group_session_epochs (id) ON DELETE CASCADE,
  recipient_device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
  author_device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE RESTRICT,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'ciphersafe.aead.xchacha.v2',
  associated_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  UNIQUE (epoch_id, recipient_device_id)
);

CREATE INDEX IF NOT EXISTS group_key_wraps_epoch_idx ON public.group_key_wraps (epoch_id);

-- -----------------------------------------------------------------------------
-- updated_at helper (name matches product spec)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS user_settings_updated_at ON public.user_settings;
DROP TRIGGER IF EXISTS contacts_updated_at ON public.contacts;
DROP TRIGGER IF EXISTS conversations_updated_at ON public.conversations;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Auth bootstrap: profile + default settings
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
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'display_name'), ''), candidate),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );

  INSERT INTO public.user_settings (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Membership helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_conversation_member(conversation_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = conversation_uuid
      AND cm.user_id = user_uuid
      AND cm.left_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_admin(conversation_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = conversation_uuid
      AND cm.user_id = user_uuid
      AND cm.left_at IS NULL
      AND cm.role IN ('owner', 'admin')
  );
$$;

-- -----------------------------------------------------------------------------
-- Direct conversation RPC (dedup symmetric pair)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_direct_conversation(UUID);
CREATE OR REPLACE FUNCTION public.create_direct_conversation(other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  existing UUID;
  conv UUID;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF other_user_id IS NULL OR other_user_id = me THEN RAISE EXCEPTION 'invalid peer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = other_user_id) THEN
    RAISE EXCEPTION 'unknown user';
  END IF;

  SELECT c.id INTO existing
  FROM public.conversations c
  WHERE c.type = 'direct'
    AND EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = c.id AND m.user_id = me AND m.left_at IS NULL)
    AND EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = c.id AND m.user_id = other_user_id AND m.left_at IS NULL)
    AND (
      SELECT COUNT(*) FROM public.conversation_members m
      WHERE m.conversation_id = c.id AND m.left_at IS NULL
    ) = 2
  LIMIT 1;

  IF existing IS NOT NULL THEN RETURN existing; END IF;

  INSERT INTO public.conversations (type, created_by)
  VALUES ('direct', me)
  RETURNING id INTO conv;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (conv, me, 'owner');
  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (conv, other_user_id, 'member');

  RETURN conv;
END;
$$;

REVOKE ALL ON FUNCTION public.create_direct_conversation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Receipt helpers (per-recipient timeline)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_message_delivered(message_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.message_recipients r
  SET delivered_at = COALESCE(r.delivered_at, NOW())
  WHERE r.message_id = message_uuid
    AND r.recipient_user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_message_read(message_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.message_recipients r
  SET read_at = NOW(), delivered_at = COALESCE(r.delivered_at, NOW())
  WHERE r.message_id = message_uuid
    AND r.recipient_user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_message_delivered(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_message_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_message_delivered(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_message_read(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Device revoke
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_device(device_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.devices d
  SET revoked_at = NOW()
  WHERE d.id = device_uuid AND d.user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_device(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_device(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Expiry soft-delete (no plaintext touched)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  UPDATE public.messages m
  SET deleted_at = NOW()
  WHERE m.expires_at IS NOT NULL
    AND m.expires_at < NOW()
    AND m.deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_messages() TO service_role;

-- -----------------------------------------------------------------------------
-- Message recipient fan-out + sender guard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.messages_guard_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'sender_id must match authenticated user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_guard_sender ON public.messages;

CREATE TRIGGER trg_messages_guard_sender
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_guard_sender();

CREATE OR REPLACE FUNCTION public.messages_fan_out_recipients()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.message_recipients (message_id, recipient_user_id, recipient_device_id, delivered_at, read_at)
  VALUES (NEW.id, NEW.sender_id, NEW.sender_device_id, NOW(), NOW());

  INSERT INTO public.message_recipients (message_id, recipient_user_id)
  SELECT NEW.id, cm.user_id
  FROM public.conversation_members cm
  WHERE cm.conversation_id = NEW.conversation_id
    AND cm.left_at IS NULL
    AND cm.user_id <> NEW.sender_id
  ON CONFLICT (message_id, recipient_user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_fan_out ON public.messages;

CREATE TRIGGER trg_messages_fan_out
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_fan_out_recipients();

CREATE OR REPLACE FUNCTION public.messages_immutable_cipher()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.ciphertext IS DISTINCT FROM OLD.ciphertext
    OR NEW.nonce IS DISTINCT FROM OLD.nonce
    OR NEW.algorithm IS DISTINCT FROM OLD.algorithm
    OR NEW.associated_data IS DISTINCT FROM OLD.associated_data
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.sender_device_id IS DISTINCT FROM OLD.sender_device_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.message_type IS DISTINCT FROM OLD.message_type
    OR NEW.reply_to_message_id IS DISTINCT FROM OLD.reply_to_message_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  ) THEN
    RAISE EXCEPTION 'messages ciphertext envelope immutable after insert';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_immutable_cipher ON public.messages;

CREATE TRIGGER trg_messages_immutable_cipher
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_immutable_cipher();

-- -----------------------------------------------------------------------------
-- Group RPCs (admin distributes epochs)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_group(p_title TEXT, p_member_user_ids UUID[])
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  conv_id UUID;
  u UUID;
  title_trim TEXT := trim(coalesce(p_title, ''));
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF title_trim = '' THEN RAISE EXCEPTION 'title required'; END IF;
  IF p_member_user_ids IS NULL THEN RAISE EXCEPTION 'members required'; END IF;

  INSERT INTO public.conversations (type, created_by, title)
  VALUES ('group', me, title_trim)
  RETURNING id INTO conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (conv_id, me, 'admin');

  FOREACH u IN ARRAY p_member_user_ids LOOP
    IF u IS NULL OR u = me THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u) THEN
      RAISE EXCEPTION 'unknown member user';
    END IF;
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (conv_id, u, 'member')
    ON CONFLICT (conversation_id, user_id) DO UPDATE
      SET left_at = NULL, role = EXCLUDED.role;
  END LOOP;

  RETURN conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group(TEXT, UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.group_add_member(p_conversation_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE c.id = p_conversation_id AND c.type = 'group'
      AND cm.user_id = me AND cm.role = 'admin' AND cm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_user_id IS NULL OR p_user_id = me THEN RAISE EXCEPTION 'invalid member'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'unknown member user';
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (p_conversation_id, p_user_id, 'member')
  ON CONFLICT (conversation_id, user_id) DO UPDATE
    SET left_at = NULL, role = 'member';
END;
$$;

REVOKE ALL ON FUNCTION public.group_add_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.group_add_member(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.group_remove_member(p_conversation_id UUID, p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF p_target_user_id = me THEN
    UPDATE public.conversation_members
    SET left_at = NOW()
    WHERE conversation_id = p_conversation_id AND user_id = me AND left_at IS NULL;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE c.id = p_conversation_id AND c.type = 'group'
      AND cm.user_id = me AND cm.role = 'admin' AND cm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.conversation_members
  SET left_at = NOW()
  WHERE conversation_id = p_conversation_id AND user_id = p_target_user_id AND left_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.group_remove_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.group_remove_member(UUID, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Security audit snapshot (dashboard)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.security_audit_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
STABLE
AS $$
DECLARE
  msg_plain INT;
  buckets JSONB;
BEGIN
  SELECT COUNT(*) INTO msg_plain
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'messages'
    AND (
      column_name ILIKE '%plaintext%'
      OR column_name ILIKE '%body_text%'
      OR column_name ILIKE '%content_text%'
      OR column_name ILIKE '%preview%'
    );

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public)), '[]'::jsonb)
    INTO buckets
    FROM storage.buckets b;
  EXCEPTION
    WHEN OTHERS THEN buckets := 'null'::JSONB;
  END;

  RETURN jsonb_build_object(
    'generated_at', NOW(),
    'messages_suspicious_plaintext_named_columns', msg_plain,
    'rls_messages', (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'messages'),
    'rls_conversations', (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'conversations'),
    'rls_conversation_members', (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'conversation_members'),
    'rls_attachments', (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'attachments'),
    'rls_devices', (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'devices'),
    'storage_buckets', buckets
  );
END;
$$;

REVOKE ALL ON FUNCTION public.security_audit_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.security_audit_snapshot() TO authenticated;

-- -----------------------------------------------------------------------------
-- Storage: private ciphertext bucket
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('encrypted-attachments', 'encrypted-attachments', false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS encrypted_attachments_insert_member ON storage.objects;
DROP POLICY IF EXISTS encrypted_attachments_select_member ON storage.objects;
DROP POLICY IF EXISTS encrypted_attachments_delete_uploader ON storage.objects;

CREATE POLICY encrypted_attachments_insert_member
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'encrypted-attachments'
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.left_at IS NULL
        AND cm.conversation_id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY encrypted_attachments_select_member
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'encrypted-attachments'
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.left_at IS NULL
        AND cm.conversation_id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY encrypted_attachments_delete_uploader
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'encrypted-attachments'
    AND owner_id::uuid = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_time_prekeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reported_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_session_epochs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_key_wraps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS user_settings_own ON public.user_settings;
DROP POLICY IF EXISTS devices_select_authenticated ON public.devices;
DROP POLICY IF EXISTS devices_mutate_own ON public.devices;
DROP POLICY IF EXISTS otpk_select_authenticated ON public.one_time_prekeys;
DROP POLICY IF EXISTS otpk_mutate_own ON public.one_time_prekeys;
DROP POLICY IF EXISTS otpk_update_own ON public.one_time_prekeys;
DROP POLICY IF EXISTS otpk_delete_own ON public.one_time_prekeys;
DROP POLICY IF EXISTS contacts_own ON public.contacts;
DROP POLICY IF EXISTS conversations_select_member ON public.conversations;
DROP POLICY IF EXISTS conversations_insert_self ON public.conversations;
DROP POLICY IF EXISTS cm_select_member ON public.conversation_members;
DROP POLICY IF EXISTS messages_select_member ON public.messages;
DROP POLICY IF EXISTS messages_insert_member ON public.messages;
DROP POLICY IF EXISTS messages_soft_delete ON public.messages;
DROP POLICY IF EXISTS mr_select_visible ON public.message_recipients;
DROP POLICY IF EXISTS mr_insert_sender ON public.message_recipients;
DROP POLICY IF EXISTS mr_update_own ON public.message_recipients;
DROP POLICY IF EXISTS attachments_select_member ON public.attachments;
DROP POLICY IF EXISTS attachments_insert_member ON public.attachments;
DROP POLICY IF EXISTS calls_select_member ON public.calls;
DROP POLICY IF EXISTS calls_insert_caller ON public.calls;
DROP POLICY IF EXISTS call_parts_member ON public.call_participants;
DROP POLICY IF EXISTS typing_member ON public.typing_events;
DROP POLICY IF EXISTS security_events_own ON public.security_events;
DROP POLICY IF EXISTS security_events_insert_own ON public.security_events;
DROP POLICY IF EXISTS reported_insert ON public.reported_messages;
DROP POLICY IF EXISTS reported_select_own ON public.reported_messages;
DROP POLICY IF EXISTS gse_select_member ON public.group_session_epochs;
DROP POLICY IF EXISTS gse_insert_admin ON public.group_session_epochs;
DROP POLICY IF EXISTS gkw_select_own_recipient ON public.group_key_wraps;
DROP POLICY IF EXISTS gkw_insert_admin_author ON public.group_key_wraps;

CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY user_settings_own ON public.user_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY devices_select_authenticated ON public.devices FOR SELECT TO authenticated USING (revoked_at IS NULL);
CREATE POLICY devices_mutate_own ON public.devices FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY otpk_select_authenticated ON public.one_time_prekeys FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_id AND d.revoked_at IS NULL));
CREATE POLICY otpk_mutate_own ON public.one_time_prekeys FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY otpk_update_own ON public.one_time_prekeys FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY otpk_delete_own ON public.one_time_prekeys FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY contacts_own ON public.contacts FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY conversations_select_member ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id, auth.uid()));
CREATE POLICY conversations_insert_self ON public.conversations FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY cm_select_member ON public.conversation_members FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));
-- Membership mutations come from SECURITY DEFINER RPCs (create_direct_conversation, create_group, …), not direct client INSERT.

CREATE POLICY messages_select_member ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()) AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()));
CREATE POLICY messages_insert_member ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id, auth.uid())
    AND EXISTS (SELECT 1 FROM public.devices d WHERE d.id = sender_device_id AND d.user_id = auth.uid() AND d.revoked_at IS NULL)
  );
CREATE POLICY messages_soft_delete ON public.messages FOR UPDATE TO authenticated
  USING (
    public.is_conversation_member(conversation_id, auth.uid())
    AND (
      sender_id = auth.uid()
      OR public.is_conversation_admin(conversation_id, auth.uid())
    )
  )
  WITH CHECK (
    public.is_conversation_member(conversation_id, auth.uid())
  );

CREATE POLICY mr_select_visible ON public.message_recipients FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND m.sender_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY mr_insert_sender ON public.message_recipients FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND m.sender_id = auth.uid()
    )
  );

CREATE POLICY mr_update_own ON public.message_recipients FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE POLICY attachments_select_member ON public.attachments FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY attachments_insert_member ON public.attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploader_id = auth.uid()
    AND public.is_conversation_member(conversation_id, auth.uid())
  );

CREATE POLICY calls_select_member ON public.calls FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY calls_insert_caller ON public.calls FOR INSERT TO authenticated
  WITH CHECK (
    caller_id = auth.uid()
    AND public.is_conversation_member(conversation_id, auth.uid())
  );

CREATE POLICY call_parts_member ON public.call_participants FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_id AND public.is_conversation_member(c.conversation_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_id AND public.is_conversation_member(c.conversation_id, auth.uid())
    )
  );

CREATE POLICY typing_member ON public.typing_events FOR ALL TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()))
  WITH CHECK (public.is_conversation_member(conversation_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY security_events_own ON public.security_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY security_events_insert_own ON public.security_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY reported_insert ON public.reported_messages FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );
CREATE POLICY reported_select_own ON public.reported_messages FOR SELECT TO authenticated USING (reporter_id = auth.uid());

CREATE POLICY gse_select_member ON public.group_session_epochs FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY gse_insert_admin ON public.group_session_epochs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.conversation_members cm ON cm.conversation_id = c.id
      WHERE c.id = conversation_id AND c.type = 'group'
        AND cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.left_at IS NULL
    )
    AND EXISTS (SELECT 1 FROM public.devices d WHERE d.id = created_by_device_id AND d.user_id = auth.uid())
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY gkw_select_own_recipient ON public.group_key_wraps FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.devices d WHERE d.id = recipient_device_id AND d.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.group_session_epochs e
      WHERE e.id = epoch_id AND public.is_conversation_member(e.conversation_id, auth.uid())
    )
  );
CREATE POLICY gkw_insert_admin_author ON public.group_key_wraps FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.devices ad WHERE ad.id = author_device_id AND ad.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.group_session_epochs e
      JOIN public.conversation_members cm ON cm.conversation_id = e.conversation_id
      WHERE e.id = epoch_id AND cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.left_at IS NULL
    )
  );

-- -----------------------------------------------------------------------------
-- Realtime publication
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_recipients;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.attachments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_session_epochs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_key_wraps;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

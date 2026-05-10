-- Privyra backend foundation — Part 1: extensions + core tables (matches MCP-applied remote).
-- Plaintext message bodies forbidden. Private keys never stored here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  bio TEXT,
  status_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profiles_username_format CHECK (
    char_length(username) >= 3
    AND username ~ '^[a-z0-9_]+$'
  )
);

CREATE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username));

COMMENT ON TABLE public.profiles IS 'Public profile fields only; no secrets or keys.';

-- -----------------------------------------------------------------------------
-- user_settings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system',
  read_receipts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  typing_indicators_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  online_presence_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  disappearing_default_seconds INTEGER,
  ai_features_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_settings IS 'Per-user UX preferences; toggles only — no message content.';

-- -----------------------------------------------------------------------------
-- devices (public key material only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_type TEXT,
  identity_public_key TEXT NOT NULL,
  identity_signing_public_key TEXT,
  signed_prekey_public TEXT,
  signed_prekey_signature TEXT,
  signed_prekey_key_id TEXT,
  public_key_algorithm TEXT NOT NULL DEFAULT 'libsodium-x25519-ed25519',
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT devices_identity_nonempty CHECK (char_length(identity_public_key) > 0)
);

CREATE INDEX IF NOT EXISTS devices_user_idx ON public.devices (user_id);

COMMENT ON TABLE public.devices IS 'Device rows hold DH/signing public halves + signed pre-key metadata only.';

-- -----------------------------------------------------------------------------
-- one_time_prekeys
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.one_time_prekeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
  key_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_id, key_id)
);

CREATE INDEX IF NOT EXISTS otpk_device_idx ON public.one_time_prekeys (device_id);

-- -----------------------------------------------------------------------------
-- contacts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  contact_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  nickname TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  safety_number TEXT,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, contact_user_id)
);

CREATE INDEX IF NOT EXISTS contacts_owner_idx ON public.contacts (owner_id);

-- -----------------------------------------------------------------------------
-- conversations & members
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  title TEXT,
  avatar_url TEXT,
  created_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  muted_until TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  last_read_message_id UUID,
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS cm_user_idx ON public.conversation_members (user_id);
CREATE INDEX IF NOT EXISTS cm_conv_idx ON public.conversation_members (conversation_id);

-- -----------------------------------------------------------------------------
-- messages (ciphertext only — never plaintext_body columns)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sender_device_id UUID REFERENCES public.devices (id),
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'libsodium-secretbox-v1',
  associated_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'attachment', 'system')),
  reply_to_message_id UUID,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_ciphertext_nonempty CHECK (char_length(ciphertext) > 0),
  CONSTRAINT messages_nonce_nonempty CHECK (char_length(nonce) > 0)
);

CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON public.messages (conversation_id, created_at DESC);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='reply_to_message_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_reply_self_fk') THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_reply_self_fk FOREIGN KEY (reply_to_message_id) REFERENCES public.messages (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='conversation_members' AND column_name='last_read_message_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_members_last_read_fk') THEN
    ALTER TABLE public.conversation_members
      ADD CONSTRAINT conversation_members_last_read_fk FOREIGN KEY (last_read_message_id) REFERENCES public.messages (id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE public.messages IS 'Client-encrypted payloads only; algorithm distinguishes envelope versions.';

-- -----------------------------------------------------------------------------
-- message_recipients (delivery/read matrix)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages (id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  recipient_device_id UUID REFERENCES public.devices (id),
  encrypted_message_key TEXT,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS message_recipients_user_idx ON public.message_recipients (recipient_user_id);

-- -----------------------------------------------------------------------------
-- attachments (metadata for ciphertext blobs in Storage)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages (id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  storage_bucket TEXT NOT NULL DEFAULT 'encrypted-attachments',
  storage_path TEXT NOT NULL,
  encrypted_file_key TEXT NOT NULL,
  nonce TEXT NOT NULL,
  original_filename_encrypted TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  sha256_ciphertext TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attachments_message_idx ON public.attachments (message_id);

COMMENT ON TABLE public.attachments IS 'Rows reference ciphertext objects only; decrypt happens client-side.';

-- -----------------------------------------------------------------------------
-- calls & typing & audit & reports
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  call_type TEXT CHECK (call_type IN ('audio', 'video')),
  status TEXT NOT NULL DEFAULT 'ringing',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE TABLE IF NOT EXISTS public.call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'invited'
);

COMMENT ON TABLE public.calls IS 'Signalling shell only — media path not implemented (incomplete feature).';

CREATE TABLE IF NOT EXISTS public.typing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  is_typing BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS typing_events_conv_idx ON public.typing_events (conversation_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_events_user_created_idx ON public.security_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.reported_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages (id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  reason TEXT,
  encrypted_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reported_messages_reporter_idx ON public.reported_messages (reporter_id);

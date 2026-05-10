-- =============================================================================
-- Group chat MVP: shared symmetric epoch keys (wrapped pairwise per device),
-- membership RPCs, security audit snapshot RPC.
-- Not MLS — see docs/GROUP_E2EE_MVP.md and SECURITY_MODEL.md roadmap.
-- =============================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS title TEXT;

COMMENT ON COLUMN public.conversations.title IS 'Human label for group chats; direct threads may leave null.';

-- -----------------------------------------------------------------------------
-- Group session epochs & pairwise wraps (ciphertext only on server)
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

COMMENT ON TABLE public.group_session_epochs IS 'Logical symmetric group-key generations; actual keys live only inside wrapped payloads.';
CREATE INDEX IF NOT EXISTS group_session_epochs_conversation_idx ON public.group_session_epochs (conversation_id, epoch DESC);

CREATE TABLE IF NOT EXISTS public.group_key_wraps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epoch_id UUID NOT NULL REFERENCES public.group_session_epochs (id) ON DELETE CASCADE,
  recipient_device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
  author_device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE RESTRICT,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'ciphersafe.aead.xchacha.v2',
  associated_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT group_key_wraps_cipher_nonempty CHECK (char_length(ciphertext) > 0),
  CONSTRAINT group_key_wraps_nonce_nonempty CHECK (char_length(nonce) > 0),
  CONSTRAINT group_key_wraps_algorithm_nonempty CHECK (char_length(algorithm) > 0),
  UNIQUE (epoch_id, recipient_device_id)
);

COMMENT ON TABLE public.group_key_wraps IS 'Pairwise-wrapped symmetric group key bytes for a specific recipient device (author encrypts).';
CREATE INDEX IF NOT EXISTS group_key_wraps_epoch_idx ON public.group_key_wraps (epoch_id);
CREATE INDEX IF NOT EXISTS group_key_wraps_recipient_idx ON public.group_key_wraps (recipient_device_id);

-- -----------------------------------------------------------------------------
-- RPCs: group lifecycle (SECURITY DEFINER)
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
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF title_trim = '' THEN
    RAISE EXCEPTION 'title required';
  END IF;
  IF p_member_user_ids IS NULL THEN
    RAISE EXCEPTION 'members required';
  END IF;

  INSERT INTO public.conversations (type, created_by, title)
  VALUES ('group', me, title_trim)
  RETURNING id INTO conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (conv_id, me, 'admin');

  FOREACH u IN ARRAY p_member_user_ids LOOP
    IF u IS NULL OR u = me THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u) THEN
      RAISE EXCEPTION 'unknown member user';
    END IF;
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (conv_id, u, 'member')
    ON CONFLICT (conversation_id, user_id) DO UPDATE
      SET left_at = NULL,
          role = EXCLUDED.role;
  END LOOP;

  RETURN conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group(TEXT, UUID[]) TO authenticated;

COMMENT ON FUNCTION public.create_group(TEXT, UUID[]) IS 'Creates a group shell; clients must publish epoch 1 wraps before messaging.';

CREATE OR REPLACE FUNCTION public.group_add_member(p_conversation_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE c.id = p_conversation_id AND c.type = 'group'
      AND cm.user_id = me AND cm.role = 'admin' AND cm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_user_id IS NULL OR p_user_id = me THEN
    RAISE EXCEPTION 'invalid member';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'unknown member user';
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (p_conversation_id, p_user_id, 'member')
  ON CONFLICT (conversation_id, user_id) DO UPDATE
    SET left_at = NULL,
        role = 'member';
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
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

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
-- Row Level Security — epochs & wraps
-- -----------------------------------------------------------------------------
ALTER TABLE public.group_session_epochs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gse_select_member ON public.group_session_epochs;
CREATE POLICY gse_select_member
  ON public.group_session_epochs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = group_session_epochs.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );

DROP POLICY IF EXISTS gse_insert_admin ON public.group_session_epochs;
CREATE POLICY gse_insert_admin
  ON public.group_session_epochs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.conversation_members cm ON cm.conversation_id = c.id
      WHERE c.id = conversation_id AND c.type = 'group'
        AND cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.left_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.devices d
      WHERE d.id = created_by_device_id AND d.user_id = auth.uid()
    )
    AND created_by_user_id = auth.uid()
  );

ALTER TABLE public.group_key_wraps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gkw_select_own_recipient ON public.group_key_wraps;
CREATE POLICY gkw_select_own_recipient
  ON public.group_key_wraps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.devices d
      WHERE d.id = recipient_device_id AND d.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.group_session_epochs e
      JOIN public.conversation_members cm ON cm.conversation_id = e.conversation_id
      WHERE e.id = epoch_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL
    )
  );

DROP POLICY IF EXISTS gkw_insert_admin_author_device ON public.group_key_wraps;
CREATE POLICY gkw_insert_admin_author_device
  ON public.group_key_wraps
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.devices ad
      WHERE ad.id = author_device_id AND ad.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.group_session_epochs e
      JOIN public.conversation_members cm ON cm.conversation_id = e.conversation_id
      WHERE e.id = epoch_id AND cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.left_at IS NULL
    )
  );

COMMENT ON POLICY gkw_insert_admin_author_device ON public.group_key_wraps IS 'Admins distribute wraps using their own device as pairwise author.';

-- -----------------------------------------------------------------------------
-- Security audit snapshot (authenticated dashboard)
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
    );

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public)), '[]'::jsonb)
    INTO buckets
    FROM storage.buckets b;
  EXCEPTION
    WHEN insufficient_privilege THEN
      buckets := 'null'::JSONB;
    WHEN undefined_table THEN
      buckets := 'null'::JSONB;
  END;

  RETURN jsonb_build_object(
    'generated_at', NOW(),
    'messages_suspicious_plaintext_named_columns', msg_plain,
    'rls_messages', (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'messages'),
    'rls_conversations', (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'conversations'),
    'rls_conversation_members', (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'conversation_members'),
    'rls_attachments', (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'attachments'),
    'rls_devices', (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'devices'),
    'storage_buckets', buckets
  );
END;
$$;

REVOKE ALL ON FUNCTION public.security_audit_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.security_audit_snapshot() TO authenticated;

COMMENT ON FUNCTION public.security_audit_snapshot() IS 'Read-only introspection for /security dashboard; does not expose secrets.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'group_session_epochs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_session_epochs;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'group_key_wraps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_key_wraps;
  END IF;
END $$;

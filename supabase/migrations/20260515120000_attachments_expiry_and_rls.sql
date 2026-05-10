-- =============================================================================
-- Expiring messages visibility, tighter attachment writes, purge helper,
-- realtime for attachment rows (client refresh).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Messages SELECT: hide expired rows at the database boundary
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS messages_select_member ON public.messages;

CREATE POLICY messages_select_member
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
    AND (messages.expires_at IS NULL OR messages.expires_at > NOW())
  );

COMMENT ON POLICY messages_select_member ON public.messages IS 'Participants see only non-expired messages (expires_at in the future or null).';

-- -----------------------------------------------------------------------------
-- 2) Attachments INSERT: only the message sender may register ciphertext metadata
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS attachments_insert_member ON public.attachments;

CREATE POLICY attachments_insert_member
  ON public.attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
        AND m.sender_id = auth.uid()
    )
  );

COMMENT ON POLICY attachments_insert_member ON public.attachments IS 'Only the original sender links ciphertext blobs to their messages.';

CREATE INDEX IF NOT EXISTS messages_expires_at_active_idx
  ON public.messages (expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON COLUMN public.messages.expires_at IS 'When set, message is hidden after this time (RLS + scheduled purge).';

-- -----------------------------------------------------------------------------
-- 3) Purge expired messages (attachments CASCADE; storage blobs deleted first)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  deleted_rows INTEGER := 0;
BEGIN
  DELETE FROM storage.objects o
  USING public.attachments a
  JOIN public.messages m ON m.id = a.message_id
  WHERE o.bucket_id = 'attachments'
    AND o.name = a.storage_path
    AND m.expires_at IS NOT NULL
    AND m.expires_at <= NOW();

  DELETE FROM public.messages
  WHERE expires_at IS NOT NULL AND expires_at <= NOW();

  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END;
$$;

COMMENT ON FUNCTION public.purge_expired_messages() IS 'Deletes expired messages (and attachment rows); removes ciphertext blobs from storage.objects first. Schedule via pg_cron or Edge Function.';

REVOKE ALL ON FUNCTION public.purge_expired_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_messages() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_messages() TO postgres;

-- -----------------------------------------------------------------------------
-- 4) Realtime: attachment metadata sync for subscribed clients
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attachments;
  END IF;
END $$;

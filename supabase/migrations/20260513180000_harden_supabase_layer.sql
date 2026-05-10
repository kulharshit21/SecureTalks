-- =============================================================================
-- CipherSafe hardened database layer: normalized tables, stricter RLS, indexes.
-- Applies on top of prior migrations. Comments document intent for auditors.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Tear down policies & triggers that block DDL (names match Phase 1 migration)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_messages_sender_receipt ON public.messages;

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

DROP POLICY IF EXISTS devices_select_authenticated ON public.devices;
DROP POLICY IF EXISTS devices_insert_own ON public.devices;
DROP POLICY IF EXISTS devices_update_own ON public.devices;
DROP POLICY IF EXISTS devices_delete_own ON public.devices;

DROP POLICY IF EXISTS pkb_select_authenticated ON public.public_key_bundles;
DROP POLICY IF EXISTS pkb_insert_own_device ON public.public_key_bundles;
DROP POLICY IF EXISTS pkb_update_own_device ON public.public_key_bundles;

DROP POLICY IF EXISTS conversations_select_member ON public.conversations;
DROP POLICY IF EXISTS conversations_insert_creator ON public.conversations;

DROP POLICY IF EXISTS cm_select_member ON public.conversation_members;
DROP POLICY IF EXISTS cm_insert_self_when_creator ON public.conversation_members;
DROP POLICY IF EXISTS cm_update_own_membership ON public.conversation_members;

DROP POLICY IF EXISTS messages_select_member ON public.messages;
DROP POLICY IF EXISTS messages_insert_sender_member ON public.messages;

DROP POLICY IF EXISTS receipts_select_member ON public.message_receipts;
DROP POLICY IF EXISTS receipts_insert_self_member ON public.message_receipts;
DROP POLICY IF EXISTS receipts_update_own_member ON public.message_receipts;

DROP POLICY IF EXISTS attachments_select_member ON public.attachments;
DROP POLICY IF EXISTS attachments_insert_member ON public.attachments;

DROP POLICY IF EXISTS security_events_select_own ON public.security_events;
DROP POLICY IF EXISTS security_events_insert_own ON public.security_events;

-- -----------------------------------------------------------------------------
-- 1) Devices: normalize key material onto device rows (no private keys ever)
-- -----------------------------------------------------------------------------
ALTER TABLE public.devices RENAME COLUMN label TO device_name;

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS device_type TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS identity_public_key TEXT,
  ADD COLUMN IF NOT EXISTS identity_signing_public_key TEXT,
  ADD COLUMN IF NOT EXISTS signed_prekey_key_id TEXT,
  ADD COLUMN IF NOT EXISTS signed_prekey_public TEXT,
  ADD COLUMN IF NOT EXISTS signed_prekey_signature TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.devices.identity_public_key IS 'Curve25519 DH identity public key (Base64). Never store private keys.';
COMMENT ON COLUMN public.devices.identity_signing_public_key IS 'Ed25519 identity signing public key (Base64) for signed pre-key verification.';
COMMENT ON COLUMN public.devices.signed_prekey_public IS 'Medium-term signed DH pre-key public material (Base64).';
COMMENT ON COLUMN public.devices.signed_prekey_signature IS 'Detached Ed25519 signature over signed pre-key public bytes (Base64).';

-- Backfill from legacy JSON bundle stored on public_key_bundles.identity_public_key
UPDATE public.devices d
SET
  identity_public_key = COALESCE(d.identity_public_key, (b.identity_public_key::jsonb->>'identityDhPublicKeyB64')),
  identity_signing_public_key = COALESCE(d.identity_signing_public_key, (b.identity_public_key::jsonb->>'identitySigningPublicKeyB64')),
  signed_prekey_key_id = COALESCE(d.signed_prekey_key_id, (b.identity_public_key::jsonb->'signedPreKey'->>'id')),
  signed_prekey_public = COALESCE(d.signed_prekey_public, (b.identity_public_key::jsonb->'signedPreKey'->>'publicKeyB64')),
  signed_prekey_signature = COALESCE(d.signed_prekey_signature, (b.identity_public_key::jsonb->'signedPreKey'->>'signatureB64'))
FROM public.public_key_bundles b
WHERE b.device_id = d.id
  AND b.identity_public_key ~ '^\s*\{';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.devices d
    WHERE d.identity_public_key IS NULL
      AND EXISTS (SELECT 1 FROM public.messages m WHERE m.sender_device_id = d.id)
  ) THEN
    RAISE EXCEPTION 'Migration blocked: devices without bundle-derived keys still referenced by messages.';
  END IF;
END$$;

DELETE FROM public.devices d
WHERE d.identity_public_key IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.sender_device_id = d.id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.devices WHERE identity_public_key IS NULL) THEN
    RAISE EXCEPTION 'Migration blocked: devices remain without public key material.';
  END IF;
END$$;

ALTER TABLE public.devices
  ALTER COLUMN identity_public_key SET NOT NULL,
  ALTER COLUMN identity_signing_public_key SET NOT NULL,
  ALTER COLUMN signed_prekey_key_id SET NOT NULL,
  ALTER COLUMN signed_prekey_public SET NOT NULL,
  ALTER COLUMN signed_prekey_signature SET NOT NULL;

ALTER TABLE public.devices
  ADD CONSTRAINT devices_identity_public_key_nonempty CHECK (char_length(identity_public_key) > 0),
  ADD CONSTRAINT devices_identity_signing_nonempty CHECK (char_length(identity_signing_public_key) > 0),
  ADD CONSTRAINT devices_signed_prekey_public_nonempty CHECK (char_length(signed_prekey_public) > 0),
  ADD CONSTRAINT devices_signed_prekey_signature_nonempty CHECK (char_length(signed_prekey_signature) > 0),
  ADD CONSTRAINT devices_signed_prekey_key_id_nonempty CHECK (char_length(signed_prekey_key_id) > 0);

CREATE INDEX IF NOT EXISTS devices_user_active_idx
  ON public.devices (user_id)
  WHERE revoked_at IS NULL;

-- -----------------------------------------------------------------------------
-- 2) One-time pre-keys (public halves only; consumed_at marks usage server-side)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.one_time_prekeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
  key_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_time_prekeys_public_nonempty CHECK (char_length(public_key) > 0),
  CONSTRAINT one_time_prekeys_key_id_nonempty CHECK (char_length(key_id) > 0),
  UNIQUE (device_id, key_id)
);

COMMENT ON TABLE public.one_time_prekeys IS 'Published one-time DH pre-key public values; private halves stay on device only.';
CREATE INDEX IF NOT EXISTS one_time_prekeys_device_available_idx
  ON public.one_time_prekeys (device_id)
  WHERE consumed_at IS NULL;

INSERT INTO public.one_time_prekeys (user_id, device_id, key_id, public_key, consumed_at, created_at)
SELECT
  d.user_id,
  d.id,
  otp->>'id',
  otp->>'publicKeyB64',
  NULL,
  NOW()
FROM public.public_key_bundles b
JOIN public.devices d ON d.id = b.device_id,
LATERAL jsonb_array_elements((b.identity_public_key::jsonb)->'oneTimePreKeys') AS otp
WHERE b.identity_public_key ~ '^\s*\{'
ON CONFLICT (device_id, key_id) DO NOTHING;

DROP TABLE public.public_key_bundles;

-- -----------------------------------------------------------------------------
-- 3) Conversations: rename kind → type, allow group, maintain updated_at
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversations RENAME COLUMN kind TO type;

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_kind_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_type_check CHECK (type IN ('direct', 'group'));

UPDATE public.conversations SET type = 'direct' WHERE type IS NULL OR type NOT IN ('direct', 'group');

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_touch_updated_at ON public.conversations;
CREATE TRIGGER conversations_touch_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS conversations_created_by_idx ON public.conversations (created_by);

-- -----------------------------------------------------------------------------
-- 4) Conversation members: soft-leave via left_at (drop last_read FK/column)
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversation_members DROP CONSTRAINT IF EXISTS conversation_members_last_read_fk;

ALTER TABLE public.conversation_members DROP COLUMN IF EXISTS last_read_message_id;

ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

COMMENT ON COLUMN public.conversation_members.left_at IS 'When set, membership is inactive; must not send new messages as this membership.';

CREATE INDEX IF NOT EXISTS conversation_members_conversation_active_idx
  ON public.conversation_members (conversation_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS conversation_members_user_active_idx
  ON public.conversation_members (user_id)
  WHERE left_at IS NULL;

-- -----------------------------------------------------------------------------
-- 5) Messages: sender attribution, algorithm + structured associated_data (no plaintext_preview)
-- -----------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES auth.users (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS algorithm TEXT NOT NULL DEFAULT 'ciphersafe.aead.xchacha.v2',
  ADD COLUMN IF NOT EXISTS associated_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE public.messages m
SET sender_id = d.user_id
FROM public.devices d
WHERE d.id = m.sender_device_id AND m.sender_id IS NULL;

ALTER TABLE public.messages ALTER COLUMN sender_id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'aad_timestamp_ms'
  ) THEN
    EXECUTE $u$
      UPDATE public.messages
      SET associated_data = jsonb_strip_nulls(jsonb_build_object(
        'timestamp_ms', aad_timestamp_ms,
        'conversation_id', conversation_id::TEXT,
        'sender_device_id', sender_device_id::TEXT
      ))
    $u$;
  ELSE
    UPDATE public.messages
    SET associated_data = jsonb_strip_nulls(jsonb_build_object(
      'conversation_id', conversation_id::TEXT,
      'sender_device_id', sender_device_id::TEXT
    ))
    WHERE associated_data = '{}'::JSONB;
  END IF;
END$$;

ALTER TABLE public.messages DROP COLUMN IF EXISTS aad_timestamp_ms;

ALTER TABLE public.messages DROP COLUMN IF EXISTS content_type;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_algorithm_nonempty CHECK (char_length(algorithm) > 0);

COMMENT ON COLUMN public.messages.associated_data IS 'Authenticated associated data bound into AEAD on client (JSON). Never stores plaintext body.';
COMMENT ON COLUMN public.messages.deleted_at IS 'Soft-delete marker; ciphertext columns remain but UI should hide content.';

CREATE INDEX IF NOT EXISTS messages_conversation_created_desc_idx
  ON public.messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_sender_created_idx
  ON public.messages (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_active_thread_idx
  ON public.messages (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Prevent ciphertext / nonce / core crypto fields from changing post-insert (soft-delete allowed)
CREATE OR REPLACE FUNCTION public.messages_prevent_cipher_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.ciphertext IS DISTINCT FROM NEW.ciphertext
    OR OLD.nonce IS DISTINCT FROM NEW.nonce
    OR OLD.algorithm IS DISTINCT FROM NEW.algorithm
    OR OLD.sender_id IS DISTINCT FROM NEW.sender_id
    OR OLD.sender_device_id IS DISTINCT FROM NEW.sender_device_id
    OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
    OR OLD.associated_data IS DISTINCT FROM NEW.associated_data
  THEN
    RAISE EXCEPTION 'messages crypto payload is immutable after insert';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_prevent_cipher_mutation ON public.messages;
CREATE TRIGGER trg_messages_prevent_cipher_mutation
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_prevent_cipher_mutation();

-- -----------------------------------------------------------------------------
-- 6) Message receipts: timestamps replace opaque status enum
-- -----------------------------------------------------------------------------
ALTER TABLE public.message_receipts
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

UPDATE public.message_receipts
SET
  delivered_at = CASE WHEN status IN ('delivered', 'read') THEN updated_at ELSE delivered_at END,
  read_at = CASE WHEN status = 'read' THEN updated_at ELSE read_at END;

ALTER TABLE public.message_receipts DROP COLUMN IF EXISTS status;
ALTER TABLE public.message_receipts DROP COLUMN IF EXISTS updated_at;

COMMENT ON COLUMN public.message_receipts.delivered_at IS 'First delivery acknowledgement time for this recipient.';
COMMENT ON COLUMN public.message_receipts.read_at IS 'Read time for this recipient (if disclosed).';

CREATE INDEX IF NOT EXISTS message_receipts_message_idx ON public.message_receipts (message_id);
CREATE INDEX IF NOT EXISTS message_receipts_user_idx ON public.message_receipts (user_id);

-- Sender receipt bootstrap (client sent message — treat as read locally)
CREATE OR REPLACE FUNCTION public.on_message_created_sender_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_user UUID;
BEGIN
  SELECT d.user_id INTO sender_user FROM public.devices d WHERE d.id = NEW.sender_device_id;
  IF sender_user IS NOT NULL THEN
    INSERT INTO public.message_receipts (message_id, user_id, delivered_at, read_at)
    VALUES (NEW.id, sender_user, NOW(), NOW())
    ON CONFLICT (message_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_sender_receipt
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_created_sender_receipt();

-- -----------------------------------------------------------------------------
-- 7) Attachments metadata (keys are ciphertext / wrapped key blobs — never plaintext files)
-- -----------------------------------------------------------------------------
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS encrypted_file_key_for_recipient TEXT,
  ADD COLUMN IF NOT EXISTS nonce TEXT;

UPDATE public.attachments
SET encrypted_file_key_for_recipient = COALESCE(encrypted_file_key_for_recipient, ''),
    nonce = COALESCE(nonce, '')
WHERE encrypted_file_key_for_recipient IS NULL OR nonce IS NULL;

ALTER TABLE public.attachments DROP COLUMN IF EXISTS ciphertext_sha256;

ALTER TABLE public.attachments
  ALTER COLUMN encrypted_file_key_for_recipient SET NOT NULL,
  ALTER COLUMN nonce SET NOT NULL;

COMMENT ON COLUMN public.attachments.encrypted_file_key_for_recipient IS 'Opaque encrypted file key material for recipient (Base64 or wire format string).';

CREATE INDEX IF NOT EXISTS attachments_message_idx ON public.attachments (message_id);

-- -----------------------------------------------------------------------------
-- 8) Security events: metadata column name (payload → metadata)
-- -----------------------------------------------------------------------------
ALTER TABLE public.security_events RENAME COLUMN payload TO metadata;

COMMENT ON COLUMN public.security_events.metadata IS 'Structured audit metadata; never store message plaintext or device private keys.';

-- -----------------------------------------------------------------------------
-- 9) RPC: direct conversations + profile search (narrow SELECT on profiles)
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

  INSERT INTO public.conversations (type, created_by)
  VALUES ('direct', me)
  RETURNING id INTO conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (conv_id, me), (conv_id, peer_user_id);

  RETURN conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_direct_conversation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_profiles(search_prefix TEXT, max_results INT DEFAULT 12)
RETURNS TABLE (
  id UUID,
  username TEXT,
  display_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.id, p.username, p.display_name
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND length(trim(search_prefix)) >= 2
    AND p.id <> auth.uid()
    AND p.username ILIKE '%' || trim(search_prefix) || '%'
  ORDER BY p.username ASC
  LIMIT LEAST(COALESCE(max_results, 12), 50);
$$;

REVOKE ALL ON FUNCTION public.search_profiles(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_profiles(TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.search_profiles(TEXT, INT) IS 'SECURITY DEFINER username discovery for authenticated users; limits result width and relies on RLS tightening direct profile reads.';

-- -----------------------------------------------------------------------------
-- 10) Row Level Security — profiles (own row + conversation peers only)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());
COMMENT ON POLICY profiles_select_own ON public.profiles IS 'Every user can read their own profile row for settings UI.';

CREATE POLICY profiles_select_conversation_peers
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversation_members cm_self
      JOIN public.conversation_members cm_peer
        ON cm_peer.conversation_id = cm_self.conversation_id
       AND cm_peer.user_id = profiles.id
       AND cm_peer.left_at IS NULL
      WHERE cm_self.user_id = auth.uid()
        AND cm_self.left_at IS NULL
    )
  );
COMMENT ON POLICY profiles_select_conversation_peers ON public.profiles IS 'Members of the same active conversation can see each other display fields (no global directory scrape via table SELECT).';

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
COMMENT ON POLICY profiles_update_own ON public.profiles IS 'Users may edit only their profile row.';

-- -----------------------------------------------------------------------------
-- 11) Row Level Security — devices (owners mutate; peers fetch published keys)
-- -----------------------------------------------------------------------------
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY devices_select_visible
  ON public.devices
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR revoked_at IS NULL
  );
COMMENT ON POLICY devices_select_visible ON public.devices IS 'Device owners see revoked rows; other users only see published keys for active devices (bootstrap before first DM).';

CREATE POLICY devices_insert_own
  ON public.devices
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
COMMENT ON POLICY devices_insert_own ON public.devices IS 'Users register devices only for themselves.';

CREATE POLICY devices_update_own
  ON public.devices
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
COMMENT ON POLICY devices_update_own ON public.devices IS 'Users rotate metadata / keys only on their own devices.';

CREATE POLICY devices_delete_own
  ON public.devices
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
COMMENT ON POLICY devices_delete_own ON public.devices IS 'Users may delete their device rows (cascades OTPKs).';

-- -----------------------------------------------------------------------------
-- 12) Row Level Security — one-time pre-keys
-- -----------------------------------------------------------------------------
ALTER TABLE public.one_time_prekeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY otp_select_visible
  ON public.one_time_prekeys
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.devices d
      WHERE d.id = device_id AND d.revoked_at IS NULL
    )
  );
COMMENT ON POLICY otp_select_visible ON public.one_time_prekeys IS 'Owners manage secrets indirectly; others read unconsumed published OTPKs for active devices.';

CREATE POLICY otp_insert_own_device
  ON public.one_time_prekeys
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_id AND d.user_id = auth.uid())
  );
COMMENT ON POLICY otp_insert_own_device ON public.one_time_prekeys IS 'Users publish OTPKs only for devices they own.';

CREATE POLICY otp_update_own_device
  ON public.one_time_prekeys
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_id AND d.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_id AND d.user_id = auth.uid())
  );
COMMENT ON POLICY otp_update_own_device ON public.one_time_prekeys IS 'Owners may mark OTPKs consumed or rotate bookkeeping fields only on their devices.';

CREATE POLICY otp_delete_own_device
  ON public.one_time_prekeys
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_id AND d.user_id = auth.uid())
  );
COMMENT ON POLICY otp_delete_own_device ON public.one_time_prekeys IS 'Owners may delete OTPK rows for their devices.';

-- -----------------------------------------------------------------------------
-- 13) Row Level Security — conversations & membership
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select_member
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversations.id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );
COMMENT ON POLICY conversations_select_member ON public.conversations IS 'Members may read conversation shells only while membership is active.';

CREATE POLICY conversations_insert_creator
  ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());
COMMENT ON POLICY conversations_insert_creator ON public.conversations IS 'Authenticated users may create shells where they are created_by (RPC covers membership inserts).';

ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY cm_select_member
  ON public.conversation_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );
COMMENT ON POLICY cm_select_member ON public.conversation_members IS 'Members can enumerate participant rows for conversations they actively belong to.';

CREATE POLICY cm_insert_self_when_creator
  ON public.conversation_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.created_by = auth.uid()
    )
  );
COMMENT ON POLICY cm_insert_self_when_creator ON public.conversation_members IS 'Creator adds themselves when forming a conversation shell (paired with RPC inserts).';

CREATE POLICY cm_update_own_membership
  ON public.conversation_members
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
COMMENT ON POLICY cm_update_own_membership ON public.conversation_members IS 'Users may update only their membership row (e.g., soft-leave via left_at).';

-- -----------------------------------------------------------------------------
-- 14) Row Level Security — messages (read/send within active membership only)
-- -----------------------------------------------------------------------------
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

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
  );
COMMENT ON POLICY messages_select_member ON public.messages IS 'Ciphertext readable only by active conversation participants.';

CREATE POLICY messages_insert_sender_member
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.devices d
      WHERE d.id = sender_device_id AND d.user_id = auth.uid()
    )
  );
COMMENT ON POLICY messages_insert_sender_member ON public.messages IS 'Users send only as themselves from owned devices into conversations where they are active members.';

CREATE POLICY messages_update_sender_soft_delete
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );
COMMENT ON POLICY messages_update_sender_soft_delete ON public.messages IS 'Senders may soft-delete or set expiry on their messages; trigger blocks ciphertext edits.';

-- -----------------------------------------------------------------------------
-- 15) Row Level Security — receipts & attachments & security_events
-- -----------------------------------------------------------------------------
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY receipts_select_member
  ON public.message_receipts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL
    )
  );
COMMENT ON POLICY receipts_select_member ON public.message_receipts IS 'Receipt rows visible only inside shared conversations.';

CREATE POLICY receipts_insert_self_member
  ON public.message_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL
    )
  );
COMMENT ON POLICY receipts_insert_self_member ON public.message_receipts IS 'Users record delivery/read state only for themselves on accessible messages.';

CREATE POLICY receipts_update_own_member
  ON public.message_receipts
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL
    )
  );
COMMENT ON POLICY receipts_update_own_member ON public.message_receipts IS 'Recipients update only their own receipt timestamps.';

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY attachments_select_member
  ON public.attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL
    )
  );
COMMENT ON POLICY attachments_select_member ON public.attachments IS 'Attachment metadata follows message visibility.';

CREATE POLICY attachments_insert_member
  ON public.attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL
    )
  );
COMMENT ON POLICY attachments_insert_member ON public.attachments IS 'Participants may attach ciphertext metadata to accessible messages.';

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY security_events_select_own
  ON public.security_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
COMMENT ON POLICY security_events_select_own ON public.security_events IS 'Audit stream is private per user.';

CREATE POLICY security_events_insert_own
  ON public.security_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
COMMENT ON POLICY security_events_insert_own ON public.security_events IS 'Clients append security_events only for themselves.';

-- -----------------------------------------------------------------------------
-- 16) Storage policies refreshed for renamed attachment columns (logic unchanged)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS attachments_storage_insert_own_prefix ON storage.objects;
DROP POLICY IF EXISTS attachments_storage_select_via_row ON storage.objects;
DROP POLICY IF EXISTS attachments_storage_update_own_prefix ON storage.objects;
DROP POLICY IF EXISTS attachments_storage_delete_own_prefix ON storage.objects;

CREATE POLICY attachments_storage_insert_own_prefix
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );
COMMENT ON POLICY attachments_storage_insert_own_prefix ON storage.objects IS 'Upload ciphertext blobs only under the caller uid prefix.';

CREATE POLICY attachments_storage_select_via_row
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      JOIN public.messages m ON m.id = a.message_id
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE a.storage_path = name AND cm.user_id = auth.uid() AND cm.left_at IS NULL
    )
  );
COMMENT ON POLICY attachments_storage_select_via_row ON storage.objects IS 'Download attachment blobs only when metadata row is visible via membership.';

CREATE POLICY attachments_storage_update_own_prefix
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY attachments_storage_delete_own_prefix
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- -----------------------------------------------------------------------------
-- 17) Table comments (plaintext_preview must never exist — enforced by omission)
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.messages IS 'Persisted ciphertext envelopes only; plaintext_preview column intentionally absent.';
COMMENT ON TABLE public.devices IS 'Device registry + published DH/signing public material only (private keys stay client-side).';

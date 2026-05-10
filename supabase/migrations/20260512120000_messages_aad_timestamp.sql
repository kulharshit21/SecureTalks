-- Client-supplied millisecond timestamp bound into AEAD associated data (must round-trip for decrypt).
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS aad_timestamp_ms BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.messages.aad_timestamp_ms IS
  'Unix epoch milliseconds included in message AEAD AAD at send time; required for decryption.';

# Database schema overview

Authoritative SQL lives under `supabase/migrations/*`. Earlier CipherSafe files coexist with **Privyra backend** migrations (`20260522100000_*`, `20260522110000_*`). The **running app** in this repo targets **`message_recipients`**, **`encrypted-attachments`**, and related Privyra-shaped tables.

## Entities (conceptual)

### `profiles` / `user_settings`

Public profile fields and UX toggles — no secrets.

### `devices` / `one_time_prekeys`

Published DH / signing / pre-key material **only**. Private keys stay client-side.

### `conversations` / `conversation_members`

Conversation shells + membership (`role`, `left_at`, …).

### `messages`

Client-encrypted payloads (**ciphertext**, **nonce**, **algorithm**, structured associated data).  
Do **not** add plaintext body columns (`body`, `content`, `text`, `plaintext_preview`, …).

### `message_recipients` (canonical for current client)

Per-recipient delivery/read matrix used by `chat-thread.tsx` (`recipient_user_id`, `delivered_at`, `read_at`).  
Older migrations may still define **`message_receipts`** — legacy name only.

### `attachments`

Metadata for ciphertext objects in Storage; **`storage_bucket`** defaults to **`encrypted-attachments`**; **`storage_path`** pattern `${conversation_id}/${message_id}/${attachment_id}.bin`.

### Group MVP tables

`group_session_epochs`, `group_key_wraps` — ciphertext-only server payloads.

### `security_events`

Structured audit metadata (`metadata` JSON — naming varies by migration generation).

## RPC helpers

- `create_direct_conversation`, `create_group`, membership mutators — SECURITY DEFINER.
- `security_audit_snapshot()` — posture JSON for `/security`.
- `cleanup_expired_messages()` — soft-expiry helper (`service_role`).
- `purge_expired_messages()` — destructive purge path for TTL+ciphertext blobs where enabled.

## Storage

Bucket **`encrypted-attachments`** (private). Policies require membership / attachment-row linkage — see migrations (`encrypted_attachments_*` policies).

## Realtime

`supabase_realtime` publication includes messaging surfaces per migrations (see `REALTIME_MODEL.md`).

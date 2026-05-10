# Database schema overview

Authoritative SQL lives in `supabase/migrations/20260511120000_ciphersafe_schema.sql` and follow-ons such as `20260516120000_group_chat_foundation.sql`. Below is a conceptual map for engineers.

## Entities

### `profiles`

Public-facing attributes (`username`, `display_name`, `avatar_url`). Used for discovery — never stores secrets.

### `devices`

Per-user device rows (`label`, `last_seen_at`). Links user ↔ messaging endpoint hardware/software.

### `public_key_bundles`

One row per device containing **only public key material** (`identity_public_key` base64). Future pre-keys would extend this table without renaming.

### `conversations` / `conversation_members`

Conversation shells plus membership graph. `last_read_message_id` tracks read pointers (metadata only).

### `messages`

Stores encrypted payloads:

| Column | Purpose |
| ------ | ------- |
| `ciphertext` | Base64 libsodium box ciphertext |
| `nonce` | Base64 nonce |
| `sender_device_id` | FK to emitting device |
| `content_type` | `text` or `attachment` marker |

**Never** add plaintext columns without revisiting the entire compliance story.

### `message_receipts`

Composite primary key `(message_id, user_id)` with `status ∈ {sent,delivered,read}`.

Sender `sent` receipt is inserted automatically via trigger when a message row is created.

### `attachments`

Metadata linking ciphertext blobs inside Storage (`storage_path`, integrity hash placeholder).

### `group_session_epochs`

Per-group symmetric epochs (`conversation_id`, `epoch`, `created_by_device_id`). Stores **no raw keys** — clients derive epoch secrets after decrypting pairwise wraps.

### `group_key_wraps`

Pairwise ciphertext (`ciphertext`, `nonce`, `associated_data`) wrapping the epoch symmetric key for `(recipient_device_id, epoch)`. Enables MVP group messaging without plaintext key material on Supabase.

### `security_events`

Structured JSON audit entries without bodies (e.g., `device_registered`).

## RPC helpers

- `create_direct_conversation(peer_user_id uuid)` — SECURITY DEFINER helper that inserts both membership rows atomically under RLS elevation.
- `create_group(title text, member_user_ids uuid[])` — creates `conversation_kind='group'`, seeds membership (`admin` caller, `member` peers).
- `group_add_member(conversation_id uuid, target_user_id uuid)` — admin-only membership insert with duplicate guards.
- `group_remove_member(conversation_id uuid, target_user_id uuid)` — admin removes member or self-leave path.
- `security_audit_snapshot()` — aggregated posture for `/security` (RLS flags, plaintext-column probes on `messages`, storage bucket ACL hints). Added in `supabase/migrations/20260516120000_group_chat_foundation.sql`.

## Storage policies

Bucket `attachments` requires conversation membership join before `SELECT`, and path-prefix ownership (`auth.uid()` folder) for mutation operations.

## Realtime publication

Migrations add tables to `supabase_realtime` so authorized clients receive ciphertext inserts (including `group_session_epochs` / `group_key_wraps` where enabled) without polling.

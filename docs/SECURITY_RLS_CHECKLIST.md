# Security & RLS verification checklist

Use this after applying migrations (`supabase db push`, `supabase migration up`, or the SQL editor). Goal: confirm Row Level Security matches the threat model—no broad profile scraping, no ciphertext reads outside membership, no foreign sends, and **no private keys in Postgres**.

## Preconditions

- Two Supabase auth users: **Alice** and **Bob** (distinct `auth.uid()` values).
- Two browsers or HTTP clients with valid JWTs for each user (Supabase JS anon key + session).
- Schema includes `search_profiles`, `create_direct_conversation`, and hardened tables from `20260513180000_harden_supabase_layer.sql`.

Record IDs as you go (`device_id`, `conversation_id`, `message_id`) for targeted checks.

---

## 1. Profiles — no global directory via table SELECT

**Expectation:** Direct `select * from profiles` as authenticated returns **only your row** (and not arbitrary users). Discovery for new chats uses **`search_profiles`** RPC, not table-wide reads.

**Steps (SQL editor or Supabase client as Alice):**

1. `select id, username from profiles` — expect **only Alice’s** profile row (or empty if RLS hides others entirely except own row).
2. As Alice, call `select * from search_profiles('bob', 12)` (adjust prefix to match Bob’s username prefix).
3. Confirm Bob appears in RPC results **without** needing a prior conversation.

**Failure modes:** Alice can `select` Bob’s profile row **before** any DM without using RPC → profiles policy is too loose.

---

## 2. Profiles — peer visibility after shared conversation

**Expectation:** Once Alice and Bob share an **active** membership (`left_at IS NULL`), each may read the other’s profile via normal `profiles` SELECT for UI (display names in thread headers).

**Steps:**

1. Create a direct conversation with `create_direct_conversation` (Alice invites Bob).
2. As Alice, `select id, username, display_name from profiles where id = '<bob_uuid>'` — expect **one row**.
3. Mark Bob’s membership `left_at = now()` (SQL as admin or future “leave” UX).
4. Repeat SELECT — expect **no row** for Bob if policies align with active membership only.

---

## 3. Conversations — members only

**Expectation:** Users only see conversations where they are **active** members.

**Steps:**

1. As Alice, fetch `conversations` where `id = '<conv_id>'` for a conversation she belongs to — expect success.
2. As **third user** Carol (not a member), same query — expect **empty**.

---

## 4. Messages — read only inside active membership

**Expectation:** Ciphertext rows are invisible outside the conversation.

**Steps:**

1. As Alice, `select id, ciphertext from messages where conversation_id = '<conv_id>'` — expect rows.
2. As Carol — expect **no rows**.

---

## 5. Messages — insert only as self, only active member, only own device

**Expectation:** Inserts must set `sender_id = auth.uid()`, use a `sender_device_id` owned by the caller, and target a conversation where `left_at IS NULL`.

**Steps:**

1. As Alice, insert a valid message row (matching app shape: `algorithm`, `associated_data`, etc.) — expect success.
2. Retry with `sender_id = '<bob_uuid>'` — expect **RLS violation**.
3. Retry with `sender_device_id` belonging to Bob — expect **RLS violation**.
4. Set Alice’s `conversation_members.left_at` for that conversation; retry insert — expect **RLS violation**.

---

## 6. Messages — ciphertext immutability

**Expectation:** After insert, changing `ciphertext`, `nonce`, `algorithm`, `sender_id`, `sender_device_id`, `conversation_id`, or `associated_data` fails at trigger level.

**Steps:**

1. As Alice (sender), `update messages set ciphertext = ciphertext || 'x' where id = '<msg_id>'` — expect **error** from `messages_prevent_cipher_mutation`.
2. Allowed (policy + trigger): update **only** soft-delete / expiry fields such as `deleted_at`, `expires_at`, `edited_at` per policy — verify separately if you rely on these columns.

---

## 7. Devices — own mutations; public read for active devices

**Expectation:** Users insert/update/delete **only** `devices` rows where `user_id = auth.uid()`. Non-owners may **read** non-revoked devices for key bootstrap (E2EE); revoked devices are hidden except to owner policy branch.

**Steps:**

1. As Alice, insert a row with `user_id = alice` — OK.
2. As Alice, insert `user_id = bob` — **denied**.
3. As Bob, `select identity_public_key from devices where id = '<alice_device_id>'` — **allowed** if Alice’s device `revoked_at` is null.
4. Set Alice `revoked_at = now()`; Bob repeats SELECT — expect **no row** (non-owner path).

Confirm **no column** stores private keys—only Base64 **public** material.

---

## 8. One-time pre-keys — same ownership rules

**Expectation:** Inserts/updates/deletes only for OTPKs whose `device_id` belongs to `auth.uid()`. Reads align with device visibility (non-revoked devices).

**Steps:**

1. As Alice, insert OTPK for Alice’s device — OK.
2. As Bob, insert OTPK row pointing at Alice’s device — **denied**.
3. As Bob, select unconsumed OTPKs for Alice’s active device — **allowed** (bootstrap).

---

## 9. Receipts — self only, membership scoped

**Expectation:** Insert/update receipt rows only with `user_id = auth.uid()`, and only for messages visible via membership.

**Steps:**

1. As Bob, upsert receipt for a message in shared conv — OK.
2. As Bob, upsert receipt with `user_id = alice` — **denied**.
3. As Carol, upsert receipt for same message — **denied**.

---

## 10. Attachments & Storage — member-gated

**Expectation:** Attachment metadata readable only with message membership; Storage `SELECT` requires a matching `attachments.storage_path`.

**Steps:**

1. As Alice, read `attachments` for message in conv — OK.
2. As Carol — empty set.
3. Attempt Storage download without membership — **denied** by `attachments_storage_select_via_row`.

---

## 11. Security events — own rows only

**Steps:**

1. As Alice, insert `security_events` with `user_id = alice` — OK.
2. Insert with `user_id = bob` — **denied**.
3. Bob cannot `select` Alice’s events — empty.

---

## 12. Column sanity — plaintext_preview absent

**Steps:**

1. `\d+ public.messages` (psql) or information_schema query — confirm **no** `plaintext_preview` column exists.
2. Spot-check `messages` rows: ciphertext looks opaque; `associated_data` contains structured metadata only (still no plaintext body).

---

## 13. Regression — realtime still tenant-safe

Realtime delivers DB changes **after** RLS on subscribe channels is satisfied by Supabase; still verify clients never pass service role keys to browsers.

---

Document failures with: policy name, SQL attempted, user role, and exact Postgres error text for fast fixes.

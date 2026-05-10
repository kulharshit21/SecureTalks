# CipherSafe architecture

CipherSafe is a **Next.js App Router** application that keeps messaging plaintext off Supabase by encrypting in the browser and storing only **ciphertext + nonces + routing metadata** in Postgres.

## Layered layout

1. **Presentation (`src/app`, `src/components`)**  
   Marketing surface, auth flows, and the chat shell (sidebar + thread + composer). UI never forwards draft plaintext to server routes or analytics hooks.

2. **Transport / identity (`src/lib/supabase`, middleware)**  
   `@supabase/ssr` maintains cookie-backed sessions. All messaging persistence happens through the Supabase Data API using the user JWT — enforced by RLS.

3. **Cryptographic façade (`src/lib/crypto`)**  
   `SessionCipher` abstracts message encryption. Phase&nbsp;1 ships `SodiumBoxCipher` (`crypto_box_*`). Future work should replace this class with libsignal/MLS without rewriting chat UI.

4. **Device vault (`src/lib/device-vault.ts`)**  
   Wraps libsodium secret keys with AES‑G‑CM using a PBKDF2‑derived key from the **device PIN**. Persisted records live in **IndexedDB**, satisfying the “no localStorage private keys” constraint.

5. **Realtime**  
   - **Postgres Changes** on `messages`, `message_receipts`, `conversation_members` deliver ciphertext/events to authorized members only (RLS‑aware Realtime).  
   - **Broadcast** channels (`conversation:{uuid}`) carry typing indicators (no plaintext payloads).  
   - **Presence** channel (`cipher-online`) emits lightweight heartbeat metadata for future UX (Phase&nbsp;1 focuses on plumbing).

## Data flow (send path)

1. User composes plaintext locally in React state.
2. Client loads recipient **public** key material from `public_key_bundles`.
3. `SodiumBoxCipher.encryptUtf8` emits `{ ciphertextB64, nonceB64 }`.
4. `buildMessageInsertRow` maps that payload to the `messages` table columns — tests assert plaintext never appears in this object graph.
5. Supabase `INSERT` stores ciphertext only.

## Data flow (receive path)

1. Realtime(or polling fallback on reconnect) surfaces new `messages` rows.
2. Client loads sender device public key via `public_key_bundles`.
3. `decryptUtf8` restores plaintext locally.

## Operational boundaries

- No Edge Functions or Route Handlers mutate message bodies (none are required for Phase&nbsp;1).
- Attachments bucket stores **ciphertext blobs**; Phase&nbsp;1 wires schema + policies but not the upload UX.

See also: `SECURITY_MODEL.md`, `THREAT_MODEL.md`, `DATABASE_SCHEMA.md`.

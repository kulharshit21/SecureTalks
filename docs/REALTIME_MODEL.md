# Realtime model

- Publication: `supabase_realtime` includes messaging-related tables per migrations (e.g. `messages`, `conversation_members`, `message_recipients`, `attachments`, typing/group tables where enabled).
- **RLS applies** — clients only receive events for rows their JWT may `SELECT`.
- Payloads remain **ciphertext** on the wire from Postgres; decryption stays in-browser.

Verify publication after schema changes (`supabase migration list` + Dashboard Realtime settings).

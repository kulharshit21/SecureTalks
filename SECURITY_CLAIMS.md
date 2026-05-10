# Security claims & evidence

## Golden rule (engineering)

**Do not fake security.**

- If something is not encrypted **client-side** end-to-end against the server, label it **incomplete** or **out-of-band** in UI and docs — never imply parity with message encryption.
- **Never** intentionally persist to app-controlled stores: plaintext private messages, private keys, raw attachment bytes, or AI prompts/completions from private chats (the Mistral proxy forwards payloads transiently only; do not add logging/DB/cache of bodies).

Prefer correctness and regression tests over marketing copy.

---

**SecureTalks** is positioned as a **privacy-first E2EE web messenger prototype**. This document separates **supported claims** from **non-claims**, and records how each is backed (code, schema, or tests).

## Supported claims (with boundaries)

| Claim | Meaning | Evidence |
| ----- | ------- | -------- |
| **Server-blind message bodies** | Supabase `messages` rows store ciphertext + nonce + algorithm + structured `associated_data`; no plaintext body column. | Schema migrations + `buildMessageInsertRow` + comments on `messages`; `/security` heuristic counts suspicious column names (expect **0**). |
| **Encrypted attachments (direct chats)** | Files are AEAD-encrypted client-side before upload; Storage holds ciphertext; DB holds wrapped file keys / manifest metadata. **Group chats:** attachment pipeline not implemented — UI disables attach and labels incomplete. | `encryptAttachmentPlaintext` → `sendEncryptedAttachmentMessage`; `send-encrypted-attachment.test.ts`; `message-composer.tsx`. |
| **Identity verification UX** | Users can compare fingerprints / verify peer bundles before trusting decryption display. | Verification modal + thread flows (see UI components). |
| **Disappearing messages** | TTL via `expires_at` + RLS filtering expired rows + purge RPC for cleanup. | Migrations (`purge_expired_messages`); docs in README. |
| **Opt-in AI** | Mistral only via **`mistral-ai-assist` Edge Function** (`functions.invoke`) after explicit UI + consent; Next `/api/ai/mistral` fallback gated off in production. | `callMistralProxy` + `no-ai-on-send-path.test.ts` + `ai-edge-contract.test.ts`. |
| **Group MVP crypto** | Symmetric epoch keys, pairwise-wrapped to members — **not** MLS / not audited large-group protocol. | `docs/GROUP_E2EE_MVP.md`, `docs/SECURITY_MODEL.md`. |

## Explicit non-claims

- **Not** “more secure than WhatsApp” or “production Signal replacement” without independent protocol audit.
- **Not** full forward secrecy / post-compromise security comparable to Signal or MLS for groups.
- **Not** protection against malware, screenshots, or OS notification previews leaking context.
- **Not** metadata hiding: timestamps, membership, sizes, and traffic patterns remain visible to the operator.

See **`LIMITATIONS.md`** and **`docs/THREAT_MODEL.md`**.

---

## Release QA pass checklist (2026-05)

Automated (local):

- `npm install` — OK  
- `npm run lint` — OK  
- `npm run typecheck` (`tsc --noEmit`) — OK  
- `npm run test` — OK  
- `npm run build` — OK  

Manual / repo audit:

1. **`console.log` of secrets** — Searched `src` for `console.(log|debug|info|warn|error)`. No `console.log`. One `console.warn` in `src/lib/supabase/client.ts` when **URL/anon env missing** in non-production; message contains **no** keys or tokens.
2. **Plaintext message persistence** — No DB columns for message bodies; in-app `plaintextById` / composer state is **memory-only** for display. Inserts use ciphertext builders only.
3. **Mistral during normal messaging** — `callMistralProxy` appears only in AI-specific handlers (`message-composer` rewrite/smart-reply buttons, `ai-export-dialog`). Vitest `no-ai-on-send-path.test.ts` guards regression.
4. **`.env` gitignored** — `.gitignore` uses `.env*` with `!.env.example`.
5. **`.env.example` safe** — Placeholders only; documents server-only `MISTRAL_API_KEY` (never `NEXT_PUBLIC_*`).
6. **Service role not on client** — Browser/server helpers use `NEXT_PUBLIC_SUPABASE_*` anon key only. `service_role` appears in SQL migrations (e.g. `GRANT EXECUTE … TO service_role` for cron workers), not in application client code.
7. **RLS on sensitive tables** — Policies exist for `profiles`, `devices`, `one_time_prekeys`, `conversations`, `conversation_members`, `messages`, `message_recipients` (current app reads this matrix), legacy migrations may still define `message_receipts`, `attachments`, `security_events`, `group_session_epochs`, `group_key_wraps`, plus Storage policies on **encrypted-attachments** bucket paths. See `docs/SECURITY_AUDIT_CHECKLIST.md` and migrations under `supabase/migrations/`.
8. **Private keys never sent to Supabase** — Device registration inserts **public** DH/signing/prekey material into `devices` / `one_time_prekeys`. Wrapped private bundle lives in **IndexedDB** (`device-vault.ts`), not uploaded as plaintext.
9. **Attachment encrypt-before-upload** — `sendEncryptedAttachmentMessage` encrypts bytes then uploads ciphertext via XHR (`send-encrypted-attachment.ts` + test). **Direct chats only**; group composer disables attach and labels the gap.
10. **README positioning** — Does not claim superiority vs WhatsApp without audit; describes prototype / honest threat model.

Dependency note: `npm audit` may report moderate advisories in dev/transitive tooling — track separately; fixing may require major upgrades (`npm audit` output at release time).

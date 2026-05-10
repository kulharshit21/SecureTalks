# Demo script (~10 minutes)

Use two browsers (or normal + incognito) with two test accounts. Prep: apply Supabase migrations, configure `.env.local`, deploy or run `npm run dev`.

## Setup (off-camera)

1. Create Supabase project; run migrations in filename order from `supabase/migrations/`.
2. Set Auth redirect URLs for local or deployed origin.
3. Copy `.env.example` → `.env.local`; fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Flow

**1. Intro (30s)**  
“**SecureTalks** — a privacy-first E2EE **web** messenger **prototype**: plaintext stays in the unlocked browser; the database holds ciphertext and encrypted blobs only.”

**2. Account & device gate (2 min)**  
- Sign up / log in user A; complete device setup with a strong PIN.  
- Point out: **private keys** wrapped to IndexedDB — not pasted into Supabase.

**3. Second user & direct chat (3 min)**  
- Sign in user B on another profile; open user A’s inbox, start conversation.  
- Send a short message; show ciphertext row in Supabase SQL editor (**optional**) — only `ciphertext`, `nonce`, `associated_data`.

**4. Verification (1 min)**  
- Open verification / fingerprint UI for the peer; explain **out-of-band confirm** (voice, second channel).

**5. Attachment (2 min)**  
- Send a small image or PDF; note **encrypt-then-upload** — Storage object should not match raw file bytes.

**6. Disappearing message (1 min)**  
- Set TTL; explain **RLS + purge** reduces server retention — **not** screenshot protection.

**7. Group (optional, 2 min)**  
- Create a small group; mention **epoch rotation** after membership changes and that this is **not MLS**.

**8. AI opt-in (1 min)**  
- Open AI helper if configured; show **consent** gate. Clarify: **normal send never calls Mistral** — only explicit AI buttons (`docs/AI_PRIVACY.md`).

**9. Audit page (1 min)**  
- Visit `/security` while logged in; walk through plaintext column count (0), RLS snapshot, env hygiene notes.

**10. Close**  
- Link repo, `SECURITY_CLAIMS.md`, `LIMITATIONS.md`; invite issues and **no hype vs WhatsApp** without audit.

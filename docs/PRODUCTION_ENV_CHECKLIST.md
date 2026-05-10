# Production environment checklist

Use this before pointing real users at production. CipherSafe / SecureTalks stores **only ciphertext** in Postgres and Storage; never relax that posture for convenience.

## Vercel (or host) — public env only

Set these in the hosting dashboard (never bake secrets into the client bundle):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (`https://<ref>.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (publishable) key — safe for browser with RLS. |
| `NEXT_PUBLIC_APP_URL` | Canonical site URL for redirects and absolute links. |
| `NEXT_PUBLIC_AI_USE_NEXT_FALLBACK` | Optional; default omit or `false`. Only `true` in dev if you intentionally proxy AI via Next route (not for production unless you accept that path). |

### Do **not** add

- `SUPABASE_SERVICE_ROLE_KEY` — server-only; never expose to the browser or `NEXT_PUBLIC_*`.
- `NEXT_PUBLIC_MISTRAL_API_KEY` — Mistral must stay server-side (Edge Function secret).
- Any private key material intended only for server or Edge.

## Supabase — Edge Function secrets

Set via Dashboard (**Edge Functions → Secrets**) or CLI (`supabase secrets set ...`):

| Secret | Required | Notes |
|--------|----------|--------|
| `MISTRAL_API_KEY` | Yes for AI features | Used only inside `mistral-ai-assist`. |
| `MISTRAL_CHAT_MODEL` | No | Defaults to `mistral-large-latest` if unset. |
| `CLEANUP_EXPIRED_SECRET` | Yes for scheduled cleanup | Shared with cron/header `x-cleanup-secret`; generate a long random string. |

Supabase also injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc., for Edge Functions—do not duplicate manually unless you know you need overrides.

## Supabase — project configuration

- [ ] **RLS** enabled on all user-facing tables (verify in migrations / Dashboard).
- [ ] Storage bucket **`encrypted-attachments`** is **private** (no public bucket policy for message payloads).
- [ ] **Edge Functions** deployed: `mistral-ai-assist`, `security-audit`, `cleanup-expired-messages`.
- [ ] **Cron** for cleanup: optional; see `docs/CRON_CLEANUP.md`.
- [ ] **Realtime** enabled for channels your app subscribes to (e.g. messages / presence as implemented).
- [ ] **Auth → URL configuration**: site URL and redirect URLs include production `NEXT_PUBLIC_APP_URL` and OAuth callbacks if used.

## Security practices

- Never commit `.env.local` or production `.env`.
- Never publish or log the **service role** key.
- Never log **plaintext** message bodies from chats.
- Do not market the product as formally **audited** unless you have completed an independent security assessment.

## Quick verification commands (local / CI)

After configuring env:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run security:edge-health
npm run smoke:two-user-chat
```

For `security:edge-health`, supply `.env.local` or export `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Optional test users unlock deeper AI checks.

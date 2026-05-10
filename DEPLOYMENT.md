# Deployment guide

## Prerequisites

- Supabase project (Postgres, Auth, Storage, optional Realtime).
- Hosting for Next.js (e.g. Vercel, Fly.io, or Node VPS).

## 1. Database & Storage

1. Open Supabase SQL editor or CLI.
2. Apply migrations **in chronological order** under `supabase/migrations/` (starting from `20260511120000_ciphersafe_schema.sql`). Later migrations replace policies and drop legacy tables — order matters.
3. Ensure Storage bucket **`encrypted-attachments`** exists (matches `ENCRYPTED_ATTACHMENTS_BUCKET` in the app); baseline migrations may create **`attachments`** — align bucket name with applied migrations. Bucket must be **private** (no public anonymous reads).
4. Configure Auth **redirect URLs** for production origin (e.g. `https://your-app.vercel.app/auth/callback`).

## 2. Expiry purge (recommended)

- Function **`purge_expired_messages()`** is granted to **`service_role`** only for cron/workers.
- Schedule via **Supabase pg_cron** or an external worker that calls Supabase with the **service role** key — **never** expose this key as `NEXT_PUBLIC_*` or bundle it in the browser.

## 3. Next.js environment

Set on the host (Vercel → Settings → Environment Variables):

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon key **only** |
| `NEXT_PUBLIC_APP_URL` | Yes (prod) | Canonical origin, e.g. `https://your-app.vercel.app` |
| `MISTRAL_API_KEY` | No | Server-only; omit to disable AI routes |
| `MISTRAL_CHAT_MODEL` | No | Default in `.env.example` |
| `AI_RATE_LIMIT_*` | No | In-memory limits per instance |

**Never** set `SUPABASE_SERVICE_ROLE_KEY` for the Next.js client bundle. If needed at all, restrict to server cron scripts outside this app’s browser surface.

### Vercel Analytics & Speed Insights

The app includes `@vercel/analytics` and `@vercel/speed-insights`. On Vercel, enable **Web Analytics** and **Speed Insights** for the project in the dashboard so data is collected (no extra env vars required for defaults).

## 4. Build & run

```bash
npm ci
npm run lint && npm run typecheck && npm run test && npm run build
npm run start
```

CI recommendation: run the same four checks on every PR.

## 5. Post-deploy checks

- Log in; send message; confirm row in `messages` has ciphertext only.
- Upload attachment; confirm Storage object is not raw file bytes.
- Open `/security` — plaintext-named column count **0**, bucket checks consistent with private attachments.
- Confirm AI routes return disabled/error without `MISTRAL_API_KEY` when AI is not desired.

## 6. Dependency audits

Run `npm audit` periodically. Moderate issues are often in dev tooling; evaluate `--force` upgrades carefully.

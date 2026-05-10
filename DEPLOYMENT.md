# Deployment guide

## Prerequisites

- Supabase project (Postgres, Auth, Storage, optional Realtime).
- Hosting for Next.js (e.g. Vercel, Fly.io, or Node VPS).

## 1. Database & Storage

1. Open Supabase SQL editor or CLI.
2. Apply migrations **in chronological order** under `supabase/migrations/` (starting from `20260511120000_ciphersafe_schema.sql`). Later migrations replace policies and drop legacy tables — order matters.
3. Ensure Storage bucket **`encrypted-attachments`** exists (matches `ENCRYPTED_ATTACHMENTS_BUCKET` in the app); baseline migrations may create **`attachments`** — align bucket name with applied migrations. Bucket must be **private** (no public anonymous reads).
4. Configure Auth **redirect URLs** for production origin (e.g. `https://your-app.vercel.app/auth/callback`).

## 2. Edge Functions & expiry jobs

Deploy **`mistral-ai-assist`**, **`security-audit`**, **`cleanup-expired-messages`** (`docs/EDGE_FUNCTIONS.md`). Set **`MISTRAL_API_KEY`** and optional **`CLEANUP_EXPIRED_SECRET`** as Edge secrets.

- **`purge_expired_messages()`** — hard delete path (+ Storage) where migration grants `service_role`.
- **`cleanup_expired_messages()`** — soft-delete (`deleted_at`) helper; **`cleanup-expired-messages`** Edge Function calls it with service role after auth/cron secret check.

Schedule purge/cleanup via **pg_cron**, Supabase scheduler, or HTTP cron hitting Edge with **`x-cleanup-secret`**.

## 3. Next.js environment

Set on the host (Vercel → Settings → Environment Variables):

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon key **only** |
| `NEXT_PUBLIC_APP_URL` | Yes (prod) | Canonical origin, e.g. `https://your-app.vercel.app` |
| `MISTRAL_API_KEY` | No | **Optional dev fallback** for `/api/ai/mistral` when `AI_PROXY_USE_NEXT_ROUTE=true` — production AI uses Edge secrets instead |
| `MISTRAL_CHAT_MODEL` | No | Default in `.env.example` |
| `AI_RATE_LIMIT_*` | No | In-memory limits per instance (Next fallback only) |
| `AI_PROXY_USE_NEXT_ROUTE` | No | **`true` only for local dev** — enables gated Next AI/security routes |
| `NEXT_PUBLIC_AI_USE_NEXT_FALLBACK` | No | **`true` only for local dev** — browser retries Next routes if Edge invoke fails |

**Never** set `SUPABASE_SERVICE_ROLE_KEY` for the Next.js client bundle. Use **`server-only`** `src/lib/supabase/admin.ts` on the server when elevation is intentional.

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
- Upload attachment; confirm Storage object is ciphertext-only under **`encrypted-attachments`**.
- Open `/security` — plaintext-named column count **0**, audit JSON shows **`deployment_surface: supabase_edge`** when Edge deploy OK.
- Invoke **`mistral-ai-assist`** without Mistral secret configured → expect safe disabled/error JSON (no stack traces with user content).

## 6. Dependency audits

Run `npm audit` periodically. Moderate issues are often in dev tooling; evaluate `--force` upgrades carefully.

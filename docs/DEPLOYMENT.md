# Deployment (docs mirror)

Primary hosting notes live in the repo root **`DEPLOYMENT.md`** (Vercel regions, env vars, Analytics).

Additional:

- **Edge Functions** are the primary path for Mistral + security audit + cleanup (`docs/EDGE_FUNCTIONS.md`).
- Configure **Supabase secrets** separately from Vercel env (Mistral key, cleanup cron secret).
- Never set `NEXT_PUBLIC_MISTRAL_*`.

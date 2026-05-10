# Supabase setup (SecureTalks / Privyra)

1. Create Supabase project (example ref documented in `.env.example`).
2. **CLI:** `npx supabase login` → `npx supabase link --project-ref <ref>` → `npx supabase db push`.
3. **Env (Next.js):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, optional `NEXT_PUBLIC_APP_URL`.
4. **Server-only:** `SUPABASE_SERVICE_ROLE_KEY` for admin scripts / Next server routes that intentionally elevate (rare); never expose to browser.
5. **Edge secrets (dashboard):** `MISTRAL_API_KEY`, optional `MISTRAL_CHAT_MODEL`, `CLEANUP_EXPIRED_SECRET` for cron cleanup header.

See [`EDGE_FUNCTIONS.md`](./EDGE_FUNCTIONS.md) and root `DEPLOYMENT.md`.

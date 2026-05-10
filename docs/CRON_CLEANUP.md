# Cron: cleanup-expired-messages

Expired disappearing messages are soft-deleted by the Edge Function `cleanup-expired-messages`, which calls the Postgres RPC `cleanup_expired_messages()` using the service role. You can trigger it on a schedule **optional**—only after `CLEANUP_EXPIRED_SECRET` is set and matches the caller.

## Security rules

- **Never** commit the real `CLEANUP_EXPIRED_SECRET` in Git (SQL files, docs, or `.env`).
- Set the secret only via Supabase Dashboard (Edge Function secrets) or `supabase secrets set`.
- The Edge Function expects header `x-cleanup-secret` equal to `CLEANUP_EXPIRED_SECRET` for cron-style calls.

## Dashboard method (simplest)

1. Supabase Dashboard → **Edge Functions** → **Secrets**: confirm `CLEANUP_EXPIRED_SECRET` exists.
2. Dashboard → **Integrations** → **Cron** (or **Database** → **Cron** / Schedules, depending on UI version).
3. Create a schedule:
   - **URL**: `https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-expired-messages`
   - **Method**: `POST`
   - **Headers**: `Content-Type: application/json`, `x-cleanup-secret: <same value as Edge secret>`
   - **Body**: `{}`
   - **Interval**: every 15 minutes (or 5 if you prefer).
4. Save and confirm the next run time.

To **disable**, delete or pause the schedule in the same UI.

## SQL method (`pg_cron` + `pg_net`)

1. Edit `supabase/sql/cron_cleanup_expired_messages.sql`:
   - Replace `PROJECT_REF` with your project reference.
   - Replace `<REPLACE_WITH_CLEANUP_EXPIRED_SECRET>` **only in your local copy** when applying to the DB, or switch to Vault as described in that file.
2. Run the SQL in **SQL Editor** (production/staging) only after review.
3. Prefer storing the secret in **Vault** and referencing `vault.decrypted_secrets` so nothing sensitive lives in the SQL file—see comments in the SQL file.

## Verify Edge Function logs

1. Dashboard → **Edge Functions** → **cleanup-expired-messages** → **Logs**.
2. Successful runs return JSON like `{ "ok": true, "rows_soft_deleted": <number> }`.
3. Wrong secret returns `403` with `{ "error": "Forbidden" }`—fix header/secret mismatch before relying on cron.

## Disable cron

- **Dashboard cron**: remove or pause the schedule.
- **SQL**: `SELECT cron.unschedule('cleanup-expired-messages-edge');` (job name must match what you scheduled).

## Related

- Edge implementation: `supabase/functions/cleanup-expired-messages/index.ts`
- RPC: `cleanup_expired_messages()` (service role / Edge only)

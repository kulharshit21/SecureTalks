-- =============================================================================
-- OPTIONAL: Schedule cleanup-expired-messages Edge Function via pg_cron + pg_net
-- =============================================================================
--
-- PROJECT: Replace PROJECT_REF below with your Supabase project ref (e.g. sigyrlchpkmxzuyilmpf).
-- SECRET:   Replace <REPLACE_WITH_CLEANUP_EXPIRED_SECRET> with the SAME value you set in:
--           Dashboard → Edge Functions → Secrets → CLEANUP_EXPIRED_SECRET
--           OR reference vault (see comments below). NEVER commit a real secret.
--
-- SAFETY:
-- - Run only after you confirm CLEANUP_EXPIRED_SECRET is set on the Edge Function deployment.
-- - Review Security Advisor after enabling extensions (Dashboard → Database → Extensions).
-- - Prefer staging first.
--
-- Schedule: default */15 * * * * (every 15 minutes). For every 5 minutes use */5 * * * *.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Extensions (Supabase: pg_cron runs jobs; pg_net performs HTTP from Postgres)
-- -----------------------------------------------------------------------------
-- If your project already has these enabled in Dashboard, these are no-ops.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 2) Schedule HTTP POST to Edge Function
-- -----------------------------------------------------------------------------
-- Replace BOTH placeholders before running:
--   PROJECT_REF  → e.g. sigyrlchpkmxzuyilmpf
--   SECRET_PLACEHOLDER → must match Edge secret CLEANUP_EXPIRED_SECRET (do not commit real value)

SELECT cron.schedule(
  'cleanup-expired-messages-edge',
  '*/15 * * * *', -- change to '*/5 * * * *' for every 5 minutes
  $cron$
  SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/cleanup-expired-messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', '<REPLACE_WITH_CLEANUP_EXPIRED_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- -----------------------------------------------------------------------------
-- 3) OPTIONAL: read secret from Supabase Vault (recommended for production)
-- -----------------------------------------------------------------------------
-- Instead of embedding the secret in this file, store it in Vault via Dashboard/SQL,
-- then replace the header line with something like:
--
--   'x-cleanup-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cleanup_expired_secret' LIMIT 1)
--
-- You must create the vault secret first; see docs/CRON_CLEANUP.md.
--

-- -----------------------------------------------------------------------------
-- 4) Inspect / disable
-- -----------------------------------------------------------------------------
-- List jobs:
--   SELECT * FROM cron.job;
--
-- Unschedule (disable periodic cleanup):
--   SELECT cron.unschedule('cleanup-expired-messages-edge');
--

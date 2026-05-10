/**
 * RLS smoke harness — **manual / test-project only**.
 *
 * Does **not** seed fake users or touch production automatically.
 * Provide Supabase URL + service role (or two user JWTs) via env and extend the script
 * for your scenario. See `docs/SECURITY_AUDIT_CHECKLIST.md`.
 *
 * Env (example):
 *   SMOKE_SUPABASE_URL=
 *   SMOKE_SUPABASE_SERVICE_ROLE_KEY=
 *
 * Exit 1 until implemented — placeholder so CI never runs this silently.
 */
process.stderr.write(
  "rls-smoke-test: not executed — edit this script for your test project and run explicitly.\n",
);
process.exit(1);

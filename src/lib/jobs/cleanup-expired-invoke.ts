"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Invokes `cleanup-expired-messages` Edge Function (JWT and/or `x-cleanup-secret`).
 * Schedule cron with shared secret; interactive callers rely on authenticated JWT only if permitted by Edge logic.
 */
export async function invokeCleanupExpiredMessages(supabase: SupabaseClient, opts?: { cronSecret?: string }) {
  const headers: Record<string, string> = {};
  if (opts?.cronSecret) headers["x-cleanup-secret"] = opts.cronSecret;
  return supabase.functions.invoke("cleanup-expired-messages", { headers, body: {} });
}

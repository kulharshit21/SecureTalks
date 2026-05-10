"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export type SecurityAuditPayload = Record<string, unknown> & {
  error?: string;
};

function devInvokeFallback(): boolean {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_AI_USE_NEXT_FALLBACK === "true";
}

/**
 * Loads security dashboard JSON from `security-audit` Edge Function (authenticated).
 */
export async function fetchSecurityAuditPayload(
  supabase: SupabaseClient,
  options?: { clientKeyPresent?: boolean },
): Promise<SecurityAuditPayload> {
  const { data, error } = await supabase.functions.invoke<SecurityAuditPayload>("security-audit", {
    body: { clientKeyPresent: Boolean(options?.clientKeyPresent) },
  });

  if (!error && data && typeof data === "object") {
    return data;
  }

  if (devInvokeFallback()) {
    const res = await fetch("/api/security/audit");
    return (await res.json()) as SecurityAuditPayload;
  }

  return { error: error?.message ?? "security-audit Edge Function unavailable." };
}

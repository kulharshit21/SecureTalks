"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiAction, AiSummarizeVariant } from "@/lib/ai/types";

export type MistralProxyResponse = { text: string } | { error: string };

function devInvokeFallback(): boolean {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_AI_USE_NEXT_FALLBACK === "true";
}

async function mistralNextFallback(body: Record<string, unknown>): Promise<MistralProxyResponse> {
  const res = await fetch("/api/ai/mistral", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : `Request failed (${res.status})`;
    return { error: err };
  }

  const text = typeof json.text === "string" ? json.text : "";
  if (!text.trim()) return { error: "Empty AI response." };
  return { text };
}

/**
 * Invokes `mistral-ai-assist` Edge Function with user JWT (via Supabase client).
 * Never import from send/decrypt paths — only explicit AI UI actions after consent.
 */
export async function callMistralProxy(
  supabase: SupabaseClient,
  input: { action: AiAction; payload: string; variant?: AiSummarizeVariant },
): Promise<MistralProxyResponse> {
  const body = {
    action: input.action,
    payload: input.payload,
    explicitConsent: true as const,
    ...(input.variant ? { variant: input.variant } : {}),
  };

  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>("mistral-ai-assist", {
    body,
  });

  if (!error && data && typeof data.text === "string") {
    const text = data.text.trim();
    if (!text) return { error: "Empty AI response." };
    return { text };
  }

  if (!error && data && typeof data.error === "string") {
    return { error: data.error };
  }

  if (devInvokeFallback()) {
    return mistralNextFallback(body);
  }

  return { error: error?.message ?? "mistral-ai-assist Edge Function unavailable." };
}

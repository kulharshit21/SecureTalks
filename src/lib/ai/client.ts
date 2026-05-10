"use client";

import type { AiPurpose } from "@/lib/ai/types";

export type MistralProxyResponse = { text: string } | { error: string };

/**
 * Calls the server proxy only when invoked by explicit UI actions.
 * Never import this file from message send/receive/decrypt paths.
 */
export async function callMistralProxy(input: { purpose: AiPurpose; payload: string }): Promise<MistralProxyResponse> {
  const res = await fetch("/api/ai/mistral", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: input.purpose, payload: input.payload }),
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

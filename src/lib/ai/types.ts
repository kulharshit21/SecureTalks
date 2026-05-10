/** Strict allow-list — Edge Function + optional Next dev fallback reject anything else. */
export const AI_ACTIONS = ["rewrite_draft", "summarize_selected", "analyze_reported"] as const;

export type AiAction = (typeof AI_ACTIONS)[number];

export function isAiAction(value: unknown): value is AiAction {
  return typeof value === "string" && (AI_ACTIONS as readonly string[]).includes(value);
}

/** Only `summarize_selected` accepts a variant (composer smart-reply vs export summary). */
export type AiSummarizeVariant = "summary" | "reply_suggestion";

export function isAiSummarizeVariant(value: unknown): value is AiSummarizeVariant {
  return value === "summary" || value === "reply_suggestion";
}

/** Maximum characters accepted for the user payload string (single round-trip). */
export const AI_MAX_PAYLOAD_CHARS = 24_000;

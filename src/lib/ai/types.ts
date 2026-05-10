/** Strict allow-list — server rejects anything else. */
export const AI_PURPOSES = ["rewrite_draft", "summarize_export", "report_analysis", "smart_reply_context"] as const;

export type AiPurpose = (typeof AI_PURPOSES)[number];

export function isAiPurpose(value: unknown): value is AiPurpose {
  return typeof value === "string" && (AI_PURPOSES as readonly string[]).includes(value);
}

/** Maximum characters accepted for the user payload string (single round-trip). */
export const AI_MAX_PAYLOAD_CHARS = 24_000;

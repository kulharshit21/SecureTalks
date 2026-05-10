import {
  AI_MAX_PAYLOAD_CHARS,
  type AiAction,
  type AiSummarizeVariant,
  isAiAction,
  isAiSummarizeVariant,
} from "@/lib/ai/types";

export type ValidatedEdgeBody = {
  action: AiAction;
  payload: string;
  explicitConsent: true;
  variant?: AiSummarizeVariant;
};

export function validateMistralProxyBody(
  input: unknown,
): { ok: true; body: ValidatedEdgeBody } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Invalid JSON body." };
  }
  const o = input as Record<string, unknown>;
  const action = o.action;
  const payload = o.payload;
  const explicitConsent = o.explicitConsent;
  const variant = o.variant;

  if (!isAiAction(action)) {
    return { ok: false, error: "Unknown or missing action." };
  }
  if (explicitConsent !== true) {
    return { ok: false, error: "explicitConsent must be true." };
  }
  if (typeof payload !== "string") {
    return { ok: false, error: "Payload must be a string." };
  }
  if (payload.length === 0) {
    return { ok: false, error: "Payload is empty." };
  }
  if (payload.length > AI_MAX_PAYLOAD_CHARS) {
    return { ok: false, error: "Payload too large." };
  }

  if (variant !== undefined) {
    if (action !== "summarize_selected") {
      return { ok: false, error: "variant is only allowed for summarize_selected." };
    }
    if (!isAiSummarizeVariant(variant)) {
      return { ok: false, error: "Invalid summarize variant." };
    }
  }

  return { ok: true, body: { action, payload, explicitConsent: true, ...(variant ? { variant } : {}) } };
}

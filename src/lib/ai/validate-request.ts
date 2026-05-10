import { AI_MAX_PAYLOAD_CHARS, type AiPurpose, isAiPurpose } from "@/lib/ai/types";

export type ValidatedBody = { purpose: AiPurpose; payload: string };

export function validateMistralProxyBody(input: unknown): { ok: true; body: ValidatedBody } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Invalid JSON body." };
  }
  const o = input as Record<string, unknown>;
  const purpose = o.purpose;
  const payload = o.payload;

  if (!isAiPurpose(purpose)) {
    return { ok: false, error: "Unknown or missing purpose." };
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

  return { ok: true, body: { purpose, payload } };
}

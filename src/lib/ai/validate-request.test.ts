import { describe, expect, it } from "vitest";

import { AI_MAX_PAYLOAD_CHARS } from "@/lib/ai/types";
import { validateMistralProxyBody } from "@/lib/ai/validate-request";

describe("validateMistralProxyBody", () => {
  it("accepts known action, explicitConsent true, bounded payload", () => {
    const v = validateMistralProxyBody({ action: "rewrite_draft", payload: "hello", explicitConsent: true });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.body.payload).toBe("hello");
  });

  it("rejects missing explicitConsent", () => {
    const v = validateMistralProxyBody({ action: "rewrite_draft", payload: "hello" });
    expect(v.ok).toBe(false);
  });

  it("rejects unknown action", () => {
    const v = validateMistralProxyBody({ action: "chat_completion", payload: "x", explicitConsent: true });
    expect(v.ok).toBe(false);
  });

  it("rejects empty payload", () => {
    const v = validateMistralProxyBody({ action: "summarize_selected", payload: "", explicitConsent: true });
    expect(v.ok).toBe(false);
  });

  it("rejects oversized payload", () => {
    const v = validateMistralProxyBody({
      action: "analyze_reported",
      payload: "x".repeat(AI_MAX_PAYLOAD_CHARS + 1),
      explicitConsent: true,
    });
    expect(v.ok).toBe(false);
  });

  it("rejects non-object body", () => {
    expect(validateMistralProxyBody(null).ok).toBe(false);
    expect(validateMistralProxyBody("nope").ok).toBe(false);
  });

  it("allows variant only for summarize_selected", () => {
    expect(
      validateMistralProxyBody({
        action: "rewrite_draft",
        payload: "x",
        explicitConsent: true,
        variant: "summary",
      }).ok,
    ).toBe(false);
    expect(
      validateMistralProxyBody({
        action: "summarize_selected",
        payload: "x",
        explicitConsent: true,
        variant: "summary",
      }).ok,
    ).toBe(true);
  });
});

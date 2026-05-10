import { describe, expect, it } from "vitest";

import { AI_MAX_PAYLOAD_CHARS } from "@/lib/ai/types";
import { validateMistralProxyBody } from "@/lib/ai/validate-request";

describe("validateMistralProxyBody", () => {
  it("accepts known purpose and bounded payload", () => {
    const v = validateMistralProxyBody({ purpose: "rewrite_draft", payload: "hello" });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.body.payload).toBe("hello");
  });

  it("rejects unknown purpose", () => {
    const v = validateMistralProxyBody({ purpose: "chat_completion", payload: "x" });
    expect(v.ok).toBe(false);
  });

  it("rejects empty payload", () => {
    const v = validateMistralProxyBody({ purpose: "summarize_export", payload: "" });
    expect(v.ok).toBe(false);
  });

  it("rejects oversized payload", () => {
    const v = validateMistralProxyBody({
      purpose: "report_analysis",
      payload: "x".repeat(AI_MAX_PAYLOAD_CHARS + 1),
    });
    expect(v.ok).toBe(false);
  });

  it("rejects non-object body", () => {
    expect(validateMistralProxyBody(null).ok).toBe(false);
    expect(validateMistralProxyBody("nope").ok).toBe(false);
  });
});

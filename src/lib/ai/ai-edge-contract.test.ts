// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "path";

import { describe, expect, it } from "vitest";

describe("AI Edge contract (client)", () => {
  const src = readFileSync(path.join(process.cwd(), "src/lib/ai/client.ts"), "utf8");

  it("invokes mistral-ai-assist Edge Function", () => {
    expect(src).toMatch(/mistral-ai-assist/);
    expect(src).toMatch(/explicitConsent:\s*true/);
  });

  it("does not embed Mistral API key", () => {
    expect(src).not.toMatch(/MISTRAL_API_KEY/);
  });
});

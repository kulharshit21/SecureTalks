// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("AI proxy route — no fake persistence or noisy logging", () => {
  const src = readFileSync(path.join(process.cwd(), "src/app/api/ai/mistral/route.ts"), "utf8");

  it("never uses console.* (avoids accidental payload logging)", () => {
    expect(src).not.toMatch(/console\./);
  });

  it("does not write to Supabase data tables from this handler", () => {
    expect(src).not.toMatch(/\.from\s*\(/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
  });
});

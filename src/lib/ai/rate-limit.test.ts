import { describe, expect, it } from "vitest";

import { checkAiRateLimit } from "@/lib/ai/rate-limit";

describe("checkAiRateLimit", () => {
  it("allows bursts up to maxInWindow inside one window", () => {
    const key = `burst-${Math.random().toString(36).slice(2)}`;
    const now = 1_000_000;
    expect(checkAiRateLimit({ key, windowMs: 60_000, maxInWindow: 2, nowMs: now })).toBe(true);
    expect(checkAiRateLimit({ key, windowMs: 60_000, maxInWindow: 2, nowMs: now })).toBe(true);
    expect(checkAiRateLimit({ key, windowMs: 60_000, maxInWindow: 2, nowMs: now })).toBe(false);
  });

  it("opens a new window after windowMs elapsed", () => {
    const key = `window-${Math.random().toString(36).slice(2)}`;
    expect(checkAiRateLimit({ key, windowMs: 1000, maxInWindow: 1, nowMs: 0 })).toBe(true);
    expect(checkAiRateLimit({ key, windowMs: 1000, maxInWindow: 1, nowMs: 500 })).toBe(false);
    expect(checkAiRateLimit({ key, windowMs: 1000, maxInWindow: 1, nowMs: 1000 })).toBe(true);
  });
});

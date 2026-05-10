import { describe, expect, test } from "vitest";

import { expiresAtIsoFromTtlMs, isMessageExpired } from "@/lib/message-expiry";

describe("message expiry", () => {
  test("expires_at in the past is expired", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    expect(isMessageExpired("2026-01-01T11:59:00.000Z", now)).toBe(true);
  });

  test("expires_at in the future is visible", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    expect(isMessageExpired("2026-01-01T12:01:00.000Z", now)).toBe(false);
  });

  test("null expires_at never expires", () => {
    expect(isMessageExpired(null, new Date())).toBe(false);
  });

  test("TTL helper yields ISO time in the future", () => {
    const nowMs = Date.parse("2026-05-01T10:00:00.000Z");
    const iso = expiresAtIsoFromTtlMs(60_000, nowMs);
    expect(iso).toBe("2026-05-01T10:01:00.000Z");
  });
});

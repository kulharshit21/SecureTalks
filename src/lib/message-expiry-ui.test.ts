import { describe, expect, test } from "vitest";

import { isMessageExpired } from "@/lib/message-expiry";

type Row = { id: string; expires_at?: string | null };

function visibleUiMessages(rows: Row[], now: Date): Row[] {
  return rows.filter((r) => !isMessageExpired(r.expires_at, now));
}

describe("expired messages UI filter", () => {
  test("expired messages disappear from UI list", () => {
    const rows: Row[] = [
      { id: "a", expires_at: "2026-01-01T10:00:00.000Z" },
      { id: "b", expires_at: null },
    ];
    const now = new Date("2026-01-01T11:00:00.000Z");
    const visible = visibleUiMessages(rows, now);
    expect(visible.map((r) => r.id)).toEqual(["b"]);
  });
});

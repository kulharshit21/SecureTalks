import { describe, expect, it } from "vitest";

import { buildMessageInsertRow } from "@/lib/crypto/message-payload";

describe("buildMessageInsertRow", () => {
  it("includes ciphertext + nonce; omits plaintext-ish keys", () => {
    const row = buildMessageInsertRow({
      conversationId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      senderUserId: "11111111-2222-4333-8444-555555555555",
      senderDeviceId: "66666666-7777-4888-8999-aaaaaaaaaaaa",
      encrypted: { ciphertextB64: "cipherb64", nonceB64: "nonceb64" },
      meta: {
        timestampMs: 1,
        conversationId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        senderDeviceId: "66666666-7777-4888-8999-aaaaaaaaaaaa",
        recipientDeviceId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      },
    });

    const keys = Object.keys(row as unknown as Record<string, unknown>);
    expect(keys).not.toContain("plaintext_body");
    expect(keys).not.toContain("plaintext_preview");
    expect(keys).not.toContain("body");
    expect(keys).not.toContain("content");
    expect(keys).not.toContain("text");
    expect(keys).not.toContain("preview");
    expect(row.ciphertext).toBeTruthy();
    expect(row.nonce).toBeTruthy();
  });
});

// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  decodeGroupKeyWrapPayload,
  decryptGroupUtf8,
  encodeGroupKeyWrapPayload,
  encryptGroupUtf8,
  generateGroupSymmetricKey,
} from "@/lib/crypto/group-crypto";

describe("group-crypto", () => {
  it("round-trips group symmetric encrypt/decrypt", async () => {
    const key = await generateGroupSymmetricKey();
    const enc = await encryptGroupUtf8("hello group", key, {
      conversationId: "00000000-0000-4000-8000-000000000001",
      senderDeviceId: "00000000-0000-4000-8000-000000000002",
      timestampMs: 1_700_000_000_000,
      groupEpoch: 3,
    });
    const out = await decryptGroupUtf8(enc, key, {
      conversationId: "00000000-0000-4000-8000-000000000001",
      senderDeviceId: "00000000-0000-4000-8000-000000000002",
      timestampMs: 1_700_000_000_000,
      groupEpoch: 3,
    });
    expect(out).toBe("hello group");
  });

  it("rejects epoch mismatch", async () => {
    const key = await generateGroupSymmetricKey();
    const enc = await encryptGroupUtf8("x", key, {
      conversationId: "00000000-0000-4000-8000-000000000001",
      senderDeviceId: "00000000-0000-4000-8000-000000000002",
      timestampMs: 100,
      groupEpoch: 1,
    });
    await expect(
      decryptGroupUtf8(enc, key, {
        conversationId: "00000000-0000-4000-8000-000000000001",
        senderDeviceId: "00000000-0000-4000-8000-000000000002",
        timestampMs: 100,
        groupEpoch: 2,
      }),
    ).rejects.toThrow(/decrypt/i);
  });

  it("round-trips wrap payload encoding", async () => {
    const key = await generateGroupSymmetricKey();
    const json = encodeGroupKeyWrapPayload(key);
    const back = decodeGroupKeyWrapPayload(json);
    expect(back.length).toBe(32);
    expect(Buffer.from(back).equals(Buffer.from(key))).toBe(true);
  });
});

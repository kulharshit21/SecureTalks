// @vitest-environment node

import { describe, expect, test } from "vitest";

import { encryptAttachmentPlaintext, decryptAttachmentPlaintext } from "@/lib/crypto/file-crypto";

describe("attachment file crypto", () => {
  test("ciphertext differs from plaintext bytes", async () => {
    const plain = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    const { fileKey, ciphertextBlob } = await encryptAttachmentPlaintext(plain);
    expect(ciphertextBlob.byteLength).not.toBe(plain.byteLength);
    const round = await decryptAttachmentPlaintext(ciphertextBlob, fileKey);
    expect(round).toEqual(plain);
  });

  test("wrong key fails decrypt", async () => {
    const plain = new TextEncoder().encode("secret payload");
    const { ciphertextBlob } = await encryptAttachmentPlaintext(plain);
    const badKey = new Uint8Array(32);
    badKey.fill(7);
    await expect(decryptAttachmentPlaintext(ciphertextBlob, badKey)).rejects.toThrow();
  });
});

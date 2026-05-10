// @vitest-environment node

import { describe, expect, test } from "vitest";

import { sendEncryptedAttachmentMessage } from "@/lib/chat/send-encrypted-attachment";
import { createMessageCipher, parsePublicKeyBundleJson, publicBundleRecordToJson } from "@/lib/crypto/session";
import { generateIdentityMaterial } from "@/lib/crypto/identity";
import { generateSignedPreKey, generateOneTimePreKeys } from "@/lib/crypto/prekeys";
import { bytesToB64 } from "@/lib/crypto/keys";
import type { PublicKeyBundleRecord, UnlockedPrivateCrypto } from "@/lib/crypto/types";
import { CRYPTO_PROTOCOL_VERSION } from "@/lib/crypto/types";

async function makeParticipant(): Promise<{ parsed: ReturnType<typeof parsePublicKeyBundleJson>; unlocked: UnlockedPrivateCrypto }> {
  const identity = await generateIdentityMaterial();
  const signedPreKey = await generateSignedPreKey(identity.signing);
  const otps = await generateOneTimePreKeys(8);

  const record: PublicKeyBundleRecord = {
    v: CRYPTO_PROTOCOL_VERSION,
    identityDhPublicKeyB64: bytesToB64(identity.dh.publicKey),
    identitySigningPublicKeyB64: bytesToB64(identity.signing.publicKey),
    signedPreKey: {
      id: signedPreKey.id,
      publicKeyB64: bytesToB64(signedPreKey.publicKey),
      signatureB64: bytesToB64(signedPreKey.signature),
    },
    oneTimePreKeys: otps.map((k) => ({ id: k.id, publicKeyB64: bytesToB64(k.publicKey) })),
  };

  const parsed = parsePublicKeyBundleJson(publicBundleRecordToJson(record));

  const unlocked: UnlockedPrivateCrypto = {
    identityDh: identity.dh,
    identitySigning: identity.signing,
    signedPreKey: {
      id: signedPreKey.id,
      secretKey: signedPreKey.secretKey,
      publicKey: signedPreKey.publicKey,
    },
    oneTimePreKeys: new Map(otps.map((k) => [k.id, k.secretKey])),
  };

  return { parsed, unlocked };
}

describe("sendEncryptedAttachmentMessage", () => {
  test("upload receives ciphertext blob, not plaintext bytes", async () => {
    const alice = await makeParticipant();
    const bob = await makeParticipant();

    const aliceCipher = createMessageCipher(alice.unlocked);

    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 19, 88]);
    const uploadedBuffers: Uint8Array[] = [];

    const supabase = {
      from: (table: string) => {
        if (table === "messages") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: "11111111-1111-4111-8111-111111111111" },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }),
          };
        }
        if (table === "attachments") {
          return {
            insert: async () => ({ error: null }),
          };
        }
        return {};
      },
      storage: {
        from: () => ({
          remove: async () => ({ error: null }),
        }),
      },
    };

    await sendEncryptedAttachmentMessage({
      supabase: supabase as never,
      cipher: aliceCipher,
      conversationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      senderUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      senderDeviceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      peerBundle: bob.parsed,
      peerDeviceId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      plaintextBytes: plaintext,
      filename: "probe.bin",
      mimeType: "application/octet-stream",
      ttlMs: null,
      uploadBlob: async (_path, blob) => {
        expect(blob.type).toBe("application/octet-stream");
        uploadedBuffers.push(new Uint8Array(await blob.arrayBuffer()));
      },
      onPhaseProgress: () => {},
    });

    expect(uploadedBuffers.length).toBe(1);
    const sent = uploadedBuffers[0]!;
    expect(sent.byteLength === plaintext.byteLength).toBe(false);
    let differs = false;
    for (let i = 0; i < Math.min(sent.length, plaintext.length); i++) {
      if (sent[i] !== plaintext[i]) differs = true;
    }
    if (sent.length !== plaintext.length) differs = true;
    expect(differs).toBe(true);
  });
});

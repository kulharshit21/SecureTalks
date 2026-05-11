// @vitest-environment node

import { describe, expect, test } from "vitest";

import { createMessageCipher, parsePublicKeyBundleJson, publicBundleRecordToJson } from "@/lib/crypto/session";
import { generateIdentityMaterial, signingPublicKeyFromSecret } from "@/lib/crypto/identity";
import { generateSignedPreKey, generateOneTimePreKeys } from "@/lib/crypto/prekeys";
import { bytesToB64, b64ToBytes } from "@/lib/crypto/keys";
import type { MessageAssociatedData, PublicKeyBundleRecord, UnlockedPrivateCrypto } from "@/lib/crypto/types";
import { CRYPTO_PROTOCOL_VERSION } from "@/lib/crypto/types";
import { fingerprintQrString, fingerprintRootBytes } from "@/lib/crypto/fingerprints";

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

describe("client crypto", () => {
  test("signing public key matches libsodium secret layout (sk_to_pk or slice fallback)", async () => {
    const id = await generateIdentityMaterial();
    const derived = await signingPublicKeyFromSecret(id.signing.secretKey);
    expect(Buffer.from(derived).equals(Buffer.from(id.signing.publicKey))).toBe(true);
  });

  test("encryption/decryption roundtrip", async () => {
    const alice = await makeParticipant();
    const bob = await makeParticipant();

    const aliceCipher = createMessageCipher(alice.unlocked);
    const bobCipher = createMessageCipher(bob.unlocked);

    const meta: MessageAssociatedData = {
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      senderDeviceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      recipientDeviceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      timestampMs: 1_700_000_000_000,
    };

    const plaintext = "hello deniability";
    const enc = await aliceCipher.encryptUtf8(plaintext, bob.parsed, meta);
    const out = await bobCipher.decryptUtf8(enc, alice.parsed, meta);
    expect(out).toBe(plaintext);
  });

  test("tampered ciphertext fails", async () => {
    const alice = await makeParticipant();
    const bob = await makeParticipant();
    const aliceCipher = createMessageCipher(alice.unlocked);
    const bobCipher = createMessageCipher(bob.unlocked);

    const meta: MessageAssociatedData = {
      conversationId: "550e8400-e29b-41d4-a716-446655440001",
      senderDeviceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      recipientDeviceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      timestampMs: 1_700_000_000_001,
    };

    const enc = await aliceCipher.encryptUtf8("payload", bob.parsed, meta);
    const bytes = b64ToBytes(enc.ciphertextB64);
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = { ciphertextB64: bytesToB64(bytes), nonceB64: enc.nonceB64 };

    await expect(bobCipher.decryptUtf8(tampered, alice.parsed, meta)).rejects.toThrow();
  });

  test("wrong recipient secret material fails decrypt", async () => {
    const alice = await makeParticipant();
    const bob = await makeParticipant();
    const charlie = await makeParticipant();

    const aliceCipher = createMessageCipher(alice.unlocked);
    const charlieCipher = createMessageCipher(charlie.unlocked);

    const meta: MessageAssociatedData = {
      conversationId: "550e8400-e29b-41d4-a716-446655440002",
      senderDeviceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      recipientDeviceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      timestampMs: 1_700_000_000_002,
    };

    const enc = await aliceCipher.encryptUtf8("secret", bob.parsed, meta);
    await expect(charlieCipher.decryptUtf8(enc, alice.parsed, meta)).rejects.toThrow();
  });

  test("plaintext bytes are not embedded in the ciphertext envelope", async () => {
    const alice = await makeParticipant();
    const bob = await makeParticipant();
    const aliceCipher = createMessageCipher(alice.unlocked);

    const meta: MessageAssociatedData = {
      conversationId: "550e8400-e29b-41d4-a716-446655440003",
      senderDeviceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      recipientDeviceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      timestampMs: 1_700_000_000_003,
    };

    const plain = "UniquePlaintextTokenOmega";
    const enc = await aliceCipher.encryptUtf8(plain, bob.parsed, meta);
    const env = b64ToBytes(enc.ciphertextB64);
    const marker = new TextEncoder().encode(plain);

    let found = false;
    outer: for (let i = 0; i <= env.length - marker.length; i++) {
      for (let j = 0; j < marker.length; j++) {
        if (env[i + j] !== marker[j]) continue outer;
      }
      found = true;
      break;
    }

    expect(found).toBe(false);
  });

  test("fingerprint is stable for the same identity DH pair order", async () => {
    const alice = await makeParticipant();
    const bob = await makeParticipant();

    const r1 = await fingerprintRootBytes(alice.parsed.identityDhPublicKey, bob.parsed.identityDhPublicKey);
    const r2 = await fingerprintRootBytes(alice.parsed.identityDhPublicKey, bob.parsed.identityDhPublicKey);

    expect(fingerprintQrString(r1)).toBe(fingerprintQrString(r2));
  });

  test("fingerprint changes when an identity DH key changes", async () => {
    const alice = await makeParticipant();
    const bob = await makeParticipant();
    const eve = await makeParticipant();

    const ab = await fingerprintRootBytes(alice.parsed.identityDhPublicKey, bob.parsed.identityDhPublicKey);
    const eb = await fingerprintRootBytes(eve.parsed.identityDhPublicKey, bob.parsed.identityDhPublicKey);

    expect(fingerprintQrString(eb)).not.toBe(fingerprintQrString(ab));
  });
});

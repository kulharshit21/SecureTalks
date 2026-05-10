import {
  encodeCanonicalAad,
  packMessageCiphertextEnvelope,
  sealMessageUtf8,
  type MessageAadCanonical,
} from "./encrypt";
import {
  buildDecryptAad,
  openMessageUtf8,
  unpackMessageCiphertextEnvelope,
} from "./decrypt";
import { b64ToBytes, bytesToB64, concatBytes } from "./keys";
import { verifySignedPreKey } from "./prekeys";
import { withSodium } from "./sodium";
import {
  CRYPTO_PROTOCOL_ID,
  CRYPTO_PROTOCOL_VERSION,
  type EncryptedWirePayload,
  type MessageAssociatedData,
  type ParsedPublicKeyBundle,
  type PublicKeyBundleRecord,
  type SessionCipher,
  type UnlockedPrivateCrypto,
} from "./types";

const ROOT_KDF_DOMAIN = new TextEncoder().encode("CipherSafe|msg-root|v2");

async function deriveAggregateDhSecret(parts: Uint8Array[]) {
  return withSodium((sodium) => sodium.crypto_generichash(32, concatBytes(...parts), null));
}

async function deriveRootMessageKey(sharedSecret: Uint8Array) {
  return withSodium((sodium) =>
    sodium.crypto_generichash(32, concatBytes(sharedSecret, ROOT_KDF_DOMAIN), null),
  );
}

async function deriveOutboundSharedSecret(params: {
  senderIdentityDhSk: Uint8Array;
  senderEphemeralSk: Uint8Array;
  recipientIdentityDhPk: Uint8Array;
  recipientSignedPreKeyPk: Uint8Array;
  recipientOneTimePreKeyPk?: Uint8Array;
}) {
  return withSodium(async (sodium) => {
    const dh1 = sodium.crypto_scalarmult(params.senderIdentityDhSk, params.recipientSignedPreKeyPk);
    const dh2 = sodium.crypto_scalarmult(params.senderEphemeralSk, params.recipientIdentityDhPk);
    const dh3 = sodium.crypto_scalarmult(params.senderEphemeralSk, params.recipientSignedPreKeyPk);
    const parts = [dh1, dh2, dh3];
    if (params.recipientOneTimePreKeyPk) {
      parts.push(sodium.crypto_scalarmult(params.senderEphemeralSk, params.recipientOneTimePreKeyPk));
    }
    return deriveAggregateDhSecret(parts);
  });
}

async function deriveInboundSharedSecret(params: {
  recipientIdentityDhSk: Uint8Array;
  recipientSignedPreKeySk: Uint8Array;
  recipientOneTimePreKeySk?: Uint8Array;
  senderIdentityDhPk: Uint8Array;
  senderEphemeralPk: Uint8Array;
}) {
  return withSodium(async (sodium) => {
    const dh1 = sodium.crypto_scalarmult(params.recipientSignedPreKeySk, params.senderIdentityDhPk);
    const dh2 = sodium.crypto_scalarmult(params.recipientIdentityDhSk, params.senderEphemeralPk);
    const dh3 = sodium.crypto_scalarmult(params.recipientSignedPreKeySk, params.senderEphemeralPk);
    const parts = [dh1, dh2, dh3];
    if (params.recipientOneTimePreKeySk) {
      parts.push(sodium.crypto_scalarmult(params.recipientOneTimePreKeySk, params.senderEphemeralPk));
    }
    return deriveAggregateDhSecret(parts);
  });
}

export function parsePublicKeyBundleJson(raw: string): ParsedPublicKeyBundle {
  let parsed: PublicKeyBundleRecord;
  try {
    parsed = JSON.parse(raw) as PublicKeyBundleRecord;
  } catch {
    throw new Error("Public key bundle must be JSON (legacy single-key bundles are not supported).");
  }
  if (parsed.v !== CRYPTO_PROTOCOL_VERSION) {
    throw new Error("Unsupported public bundle version.");
  }
  return {
    identityDhPublicKey: b64ToBytes(parsed.identityDhPublicKeyB64),
    identitySigningPublicKey: b64ToBytes(parsed.identitySigningPublicKeyB64),
    signedPreKeyPublicKey: b64ToBytes(parsed.signedPreKey.publicKeyB64),
    signedPreKeySignature: b64ToBytes(parsed.signedPreKey.signatureB64),
    signedPreKeyId: parsed.signedPreKey.id,
    oneTimePreKeys: parsed.oneTimePreKeys.map((k) => ({
      id: k.id,
      publicKey: b64ToBytes(k.publicKeyB64),
    })),
  };
}

export function publicBundleRecordToJson(record: PublicKeyBundleRecord) {
  return JSON.stringify(record);
}

export function createMessageCipher(unlocked: UnlockedPrivateCrypto): SessionCipher {
  return new MessageCipher(unlocked);
}

class MessageCipher implements SessionCipher {
  readonly protocolId = CRYPTO_PROTOCOL_ID;

  constructor(private readonly unlocked: UnlockedPrivateCrypto) {}

  async encryptUtf8(plaintext: string, recipient: ParsedPublicKeyBundle, meta: MessageAssociatedData) {
    const signingOk = await verifySignedPreKey(
      recipient.identitySigningPublicKey,
      recipient.signedPreKeyPublicKey,
      recipient.signedPreKeySignature,
    );
    if (!signingOk) throw new Error("Invalid signed pre-key.");

    const otp = recipient.oneTimePreKeys.length > 0 ? recipient.oneTimePreKeys[0] : undefined;

    const ephemeral = await withSodium((sodium) => sodium.crypto_box_keypair());

    const shared = await deriveOutboundSharedSecret({
      senderIdentityDhSk: this.unlocked.identityDh.secretKey,
      senderEphemeralSk: ephemeral.privateKey,
      recipientIdentityDhPk: recipient.identityDhPublicKey,
      recipientSignedPreKeyPk: recipient.signedPreKeyPublicKey,
      recipientOneTimePreKeyPk: otp?.publicKey,
    });

    const rootKey = await deriveRootMessageKey(shared);

    const ephemeralB64 = bytesToB64(ephemeral.publicKey);
    const otpIdForAad = otp ? otp.id : null;

    const aadPayload: MessageAadCanonical = {
      conversationId: meta.conversationId,
      senderDeviceId: meta.senderDeviceId,
      recipientDeviceId: meta.recipientDeviceId,
      timestampMs: meta.timestampMs,
      senderEphemeralPublicKeyB64: ephemeralB64,
      oneTimePreKeyId: otpIdForAad,
    };
    const aadBytes = encodeCanonicalAad(aadPayload);

    const sealed = await sealMessageUtf8(plaintext, rootKey, aadBytes);

    const ciphertextB64 = packMessageCiphertextEnvelope({
      ephemeralPublicKey: ephemeral.publicKey,
      oneTimePreKeyId: otp ? otp.id : "",
      rawCiphertext: sealed.rawCiphertext,
    });

    return {
      ciphertextB64,
      nonceB64: bytesToB64(sealed.nonce),
    };
  }

  async decryptUtf8(payload: EncryptedWirePayload, sender: ParsedPublicKeyBundle, meta: MessageAssociatedData) {
    const signingOk = await verifySignedPreKey(
      sender.identitySigningPublicKey,
      sender.signedPreKeyPublicKey,
      sender.signedPreKeySignature,
    );
    if (!signingOk) throw new Error("Invalid sender signed pre-key.");

    const unpacked = unpackMessageCiphertextEnvelope(payload.ciphertextB64);
    const nonce = b64ToBytes(payload.nonceB64);

    const otpId = unpacked.oneTimePreKeyId.length === 0 ? null : unpacked.oneTimePreKeyId;
    const otpSecret = otpId ? this.unlocked.oneTimePreKeys.get(otpId) : undefined;
    if (otpId && !otpSecret) {
      throw new Error("Missing one-time pre-key secret for decryption.");
    }

    const shared = await deriveInboundSharedSecret({
      recipientIdentityDhSk: this.unlocked.identityDh.secretKey,
      recipientSignedPreKeySk: this.unlocked.signedPreKey.secretKey,
      recipientOneTimePreKeySk: otpSecret,
      senderIdentityDhPk: sender.identityDhPublicKey,
      senderEphemeralPk: unpacked.ephemeralPublicKey,
    });

    const rootKey = await deriveRootMessageKey(shared);

    const ephemeralB64 = bytesToB64(unpacked.ephemeralPublicKey);
    const aadBytes = buildDecryptAad({
      conversationId: meta.conversationId,
      senderDeviceId: meta.senderDeviceId,
      recipientDeviceId: meta.recipientDeviceId,
      timestampMs: meta.timestampMs,
      senderEphemeralPublicKeyB64: ephemeralB64,
      oneTimePreKeyId: otpId,
    });

    try {
      const plain = await openMessageUtf8(unpacked.rawCiphertext, nonce, rootKey, aadBytes);
      return plain;
    } catch {
      throw new Error("Could not decrypt message.");
    }
  }
}

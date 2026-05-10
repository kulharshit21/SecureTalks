import { bytesToB64, concatBytes } from "./keys";
import { withSodium } from "./sodium";

export interface PackedCiphertext {
  ephemeralPublicKey: Uint8Array;
  oneTimePreKeyId: string;
  rawCiphertext: Uint8Array;
}

export interface MessageAadCanonical {
  conversationId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  timestampMs: number;
  senderEphemeralPublicKeyB64: string;
  oneTimePreKeyId: string | null;
}

export function encodeCanonicalAad(meta: MessageAadCanonical): Uint8Array {
  const payload = {
    conversation_id: meta.conversationId,
    recipient_device_id: meta.recipientDeviceId,
    sender_device_id: meta.senderDeviceId,
    timestamp_ms: meta.timestampMs,
    sender_ephemeral_public_key_b64: meta.senderEphemeralPublicKeyB64,
    one_time_prekey_id: meta.oneTimePreKeyId,
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

/**
 * XChaCha20-Poly1305 encrypt (random nonce). Returns nonce + ciphertext bytes (libciphertext includes auth tag).
 */
export async function sealMessageUtf8(
  plaintextUtf8: string,
  rootKey: Uint8Array,
  aad: Uint8Array,
): Promise<{ nonce: Uint8Array; rawCiphertext: Uint8Array }> {
  return withSodium((sodium) => {
    const msg = new TextEncoder().encode(plaintextUtf8);
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(msg, aad, null, nonce, rootKey);
    return { nonce, rawCiphertext: cipher };
  });
}

/**
 * Wire layout: ephemeral_pk (32) | otp_id_len u16 BE | otp_id utf8 | raw_aead_ciphertext
 */
export function packMessageCiphertextEnvelope(packed: PackedCiphertext): string {
  const idBytes = new TextEncoder().encode(packed.oneTimePreKeyId);
  if (idBytes.length > 65535) throw new Error("One-time pre-key id too long.");
  const len = new Uint8Array(2);
  new DataView(len.buffer).setUint16(0, idBytes.length, false);
  const body = concatBytes(packed.ephemeralPublicKey, len, idBytes, packed.rawCiphertext);
  return bytesToB64(body);
}

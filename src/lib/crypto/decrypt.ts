import { b64ToBytes } from "./keys";
import type { MessageAadCanonical } from "./encrypt";
import { encodeCanonicalAad } from "./encrypt";
import type { PackedCiphertext } from "./encrypt";
import { withSodium } from "./sodium";

const EPHEMERAL_PK_LENGTH = 32;

export function unpackMessageCiphertextEnvelope(b64: string): PackedCiphertext {
  const body = b64ToBytes(b64);
  if (body.length < EPHEMERAL_PK_LENGTH + 2) throw new Error("Ciphertext envelope too short.");
  let o = 0;
  const ephemeralPublicKey = clone32(body.subarray(o, o + EPHEMERAL_PK_LENGTH));
  o += EPHEMERAL_PK_LENGTH;
  const idLen = new DataView(body.buffer, body.byteOffset + o, 2).getUint16(0, false);
  o += 2;
  if (body.length < o + idLen) throw new Error("Ciphertext envelope truncated.");
  const oneTimePreKeyId = new TextDecoder().decode(body.subarray(o, o + idLen));
  o += idLen;
  const rawSlice = body.subarray(o);
  const rawCiphertext = new Uint8Array(rawSlice.length);
  rawCiphertext.set(rawSlice);
  return { ephemeralPublicKey, oneTimePreKeyId, rawCiphertext };
}

function clone32(slice: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  out.set(slice);
  return out;
}

export async function openMessageUtf8(
  rawCiphertext: Uint8Array,
  nonce: Uint8Array,
  rootKey: Uint8Array,
  aad: Uint8Array,
): Promise<string> {
  return withSodium((sodium) => {
    const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, rawCiphertext, aad, nonce, rootKey);
    return new TextDecoder().decode(plain);
  });
}

export interface MessageDecryptAadInput {
  conversationId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  timestampMs: number;
  senderEphemeralPublicKeyB64: string;
  oneTimePreKeyId: string | null;
}

export function buildDecryptAad(meta: MessageDecryptAadInput): Uint8Array {
  const canonical: MessageAadCanonical = {
    conversationId: meta.conversationId,
    senderDeviceId: meta.senderDeviceId,
    recipientDeviceId: meta.recipientDeviceId,
    timestampMs: meta.timestampMs,
    senderEphemeralPublicKeyB64: meta.senderEphemeralPublicKeyB64,
    oneTimePreKeyId: meta.oneTimePreKeyId,
  };
  return encodeCanonicalAad(canonical);
}

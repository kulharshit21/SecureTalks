import { openMessageUtf8 } from "./decrypt";
import { sealMessageUtf8 } from "./encrypt";
import { b64ToBytes, bytesToB64 } from "./keys";
import { withSodium } from "./sodium";
import type { EncryptedWirePayload } from "./types";

/** Stored in message rows for symmetric group payloads (distinct from pairwise DH envelope). */
export const GROUP_PROTOCOL_ID = "ciphersafe.group.aead.xchacha.v1";

/** Sentinel recipient_device_id in associated_data for group ciphertext rows. */
export const GROUP_ASSOCIATED_RECIPIENT_ID = "__group__";

export async function generateGroupSymmetricKey(): Promise<Uint8Array> {
  return withSodium((sodium) => {
    const buf = sodium.randombytes_buf(32);
    return new Uint8Array(buf);
  });
}

export function encodeGroupKeyWrapPayload(groupKey32: Uint8Array): string {
  if (groupKey32.length !== 32) throw new Error("Group key must be 32 bytes.");
  return JSON.stringify({ v: 1, k: bytesToB64(groupKey32) });
}

export function decodeGroupKeyWrapPayload(plaintextUtf8: string): Uint8Array {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintextUtf8) as unknown;
  } catch {
    throw new Error("Invalid group key wrap payload.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid group key wrap payload.");
  const k = (parsed as { k?: unknown }).k;
  if (typeof k !== "string") throw new Error("Invalid group key wrap payload.");
  const bytes = b64ToBytes(k);
  if (bytes.length !== 32) throw new Error("Decoded group key must be 32 bytes.");
  return bytes;
}

export function encodeGroupMessageAad(input: {
  conversationId: string;
  senderDeviceId: string;
  timestampMs: number;
  groupEpoch: number;
}): Uint8Array {
  const payload = {
    v: 1,
    scope: "ciphersafe.group.message",
    conversation_id: input.conversationId,
    sender_device_id: input.senderDeviceId,
    timestamp_ms: input.timestampMs,
    group_epoch: input.groupEpoch,
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

export async function encryptGroupUtf8(
  plaintextUtf8: string,
  groupKey32: Uint8Array,
  input: {
    conversationId: string;
    senderDeviceId: string;
    timestampMs: number;
    groupEpoch: number;
  },
): Promise<EncryptedWirePayload> {
  if (groupKey32.length !== 32) throw new Error("Group key must be 32 bytes.");
  const aad = encodeGroupMessageAad(input);
  const sealed = await sealMessageUtf8(plaintextUtf8, groupKey32, aad);
  return {
    ciphertextB64: bytesToB64(sealed.rawCiphertext),
    nonceB64: bytesToB64(sealed.nonce),
  };
}

export async function decryptGroupUtf8(
  payload: EncryptedWirePayload,
  groupKey32: Uint8Array,
  input: {
    conversationId: string;
    senderDeviceId: string;
    timestampMs: number;
    groupEpoch: number;
  },
): Promise<string> {
  if (groupKey32.length !== 32) throw new Error("Group key must be 32 bytes.");
  const aad = encodeGroupMessageAad(input);
  const raw = b64ToBytes(payload.ciphertextB64);
  const nonce = b64ToBytes(payload.nonceB64);
  try {
    return await openMessageUtf8(raw, nonce, groupKey32, aad);
  } catch {
    throw new Error("Could not decrypt group message.");
  }
}

import { GROUP_ASSOCIATED_RECIPIENT_ID } from "./group-crypto";
import type { EncryptedWirePayload } from "./types";
import { CRYPTO_PROTOCOL_ID } from "./types";

export interface MessageAssociatedDataWire {
  timestamp_ms: number;
  conversation_id: string;
  sender_device_id: string;
  recipient_device_id: string;
  group_epoch?: number;
}

export interface MessageInsertRow {
  conversation_id: string;
  sender_id: string;
  sender_device_id: string;
  ciphertext: string;
  nonce: string;
  algorithm: string;
  associated_data: MessageAssociatedDataWire;
  expires_at?: string | null;
}

/**
 * Builds the exact row shape inserted into `public.messages`.
 * Centralised so tests can prove plaintext never appears in DB payloads.
 */
export function buildMessageInsertRow(input: {
  conversationId: string;
  senderUserId: string;
  senderDeviceId: string;
  encrypted: EncryptedWirePayload;
  meta: {
    timestampMs: number;
    conversationId: string;
    senderDeviceId: string;
    recipientDeviceId: string;
    groupEpoch?: number;
  };
  algorithm?: string;
  expiresAtIso?: string | null;
}): MessageInsertRow {
  const associated_data: MessageAssociatedDataWire = {
    timestamp_ms: input.meta.timestampMs,
    conversation_id: input.meta.conversationId,
    sender_device_id: input.meta.senderDeviceId,
    recipient_device_id:
      input.meta.groupEpoch !== undefined ? GROUP_ASSOCIATED_RECIPIENT_ID : input.meta.recipientDeviceId,
  };
  if (input.meta.groupEpoch !== undefined) {
    associated_data.group_epoch = input.meta.groupEpoch;
  }

  const row: MessageInsertRow = {
    conversation_id: input.conversationId,
    sender_id: input.senderUserId,
    sender_device_id: input.senderDeviceId,
    ciphertext: input.encrypted.ciphertextB64,
    nonce: input.encrypted.nonceB64,
    algorithm: input.algorithm ?? CRYPTO_PROTOCOL_ID,
    associated_data,
  };

  if (input.expiresAtIso !== undefined) {
    row.expires_at = input.expiresAtIso;
  }

  return row;
}

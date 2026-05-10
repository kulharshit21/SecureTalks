import { GROUP_ASSOCIATED_RECIPIENT_ID, GROUP_PROTOCOL_ID } from "@/lib/crypto/group-crypto";
import type { MessageAssociatedData } from "@/lib/crypto/types";

type AssociatedDataRow = {
  timestamp_ms?: number;
  conversation_id?: string;
  sender_device_id?: string;
  recipient_device_id?: string;
  group_epoch?: number;
};

export type WireMessageLike = {
  conversation_id: string;
  sender_device_id: string;
  algorithm?: string;
  associated_data?: AssociatedDataRow;
};

/** Canonical decrypt/meta binding matching chat-thread message decryption. */
export function messageMetaFromWire(
  row: WireMessageLike,
  myDeviceId: string,
  peerDeviceId: string | null,
): MessageAssociatedData | null {
  const ad = row.associated_data ?? {};
  const isGroup = row.algorithm === GROUP_PROTOCOL_ID || typeof ad.group_epoch === "number";
  if (isGroup) {
    const ge = Number(ad.group_epoch);
    if (!Number.isFinite(ge) || ge < 1) return null;
    const recipientDeviceId =
      typeof ad.recipient_device_id === "string" && ad.recipient_device_id.length > 0
        ? ad.recipient_device_id
        : GROUP_ASSOCIATED_RECIPIENT_ID;
    return {
      conversationId: row.conversation_id,
      senderDeviceId: row.sender_device_id,
      recipientDeviceId,
      timestampMs: Number(ad.timestamp_ms) || 0,
      groupEpoch: ge,
    };
  }

  if (!peerDeviceId) return null;
  const recipientDeviceId =
    typeof ad.recipient_device_id === "string" && ad.recipient_device_id.length > 0
      ? ad.recipient_device_id
      : row.sender_device_id === myDeviceId
        ? peerDeviceId
        : myDeviceId;

  return {
    conversationId: row.conversation_id,
    senderDeviceId: row.sender_device_id,
    recipientDeviceId,
    timestampMs: Number(ad.timestamp_ms) || 0,
  };
}

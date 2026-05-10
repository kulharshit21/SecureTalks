import type { MessageAssociatedData } from "@/lib/crypto/types";

type AssociatedDataRow = {
  timestamp_ms?: number;
  conversation_id?: string;
  sender_device_id?: string;
  recipient_device_id?: string;
};

export type WireMessageLike = {
  conversation_id: string;
  sender_device_id: string;
  associated_data?: AssociatedDataRow;
};

/** Canonical decrypt/meta binding matching chat-thread message decryption. */
export function messageMetaFromWire(
  row: WireMessageLike,
  myDeviceId: string,
  peerDeviceId: string | null,
): MessageAssociatedData | null {
  if (!peerDeviceId) return null;
  const ad = row.associated_data ?? {};
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

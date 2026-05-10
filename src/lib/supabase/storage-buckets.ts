/** Private bucket for ciphertext attachment blobs (matches Storage + DB default). */
export const ENCRYPTED_ATTACHMENTS_BUCKET = "encrypted-attachments" as const;

export function encryptedAttachmentObjectPath(conversationId: string, messageId: string, attachmentId: string): string {
  return `${conversationId}/${messageId}/${attachmentId}.bin`;
}

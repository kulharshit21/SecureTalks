import type { SupabaseClient } from "@supabase/supabase-js";

import type { AttachmentManifest } from "@/lib/crypto/attachment-manifest";
import { ATTACHMENT_MANIFEST_KIND } from "@/lib/crypto/attachment-manifest";
import { encryptAttachmentPlaintext } from "@/lib/crypto/file-crypto";
import { bytesToB64 } from "@/lib/crypto/keys";
import { buildMessageInsertRow } from "@/lib/crypto/message-payload";
import type { MessageAssociatedData, ParsedPublicKeyBundle, SessionCipher } from "@/lib/crypto/types";
import { expiresAtIsoFromTtlMs } from "@/lib/message-expiry";

export type UploadEncryptedBlobFn = (
  storagePath: string,
  ciphertextBlob: Blob,
  onUploadProgress: (ratio01: number) => void,
) => Promise<void>;

export type AttachmentInsertRow = {
  message_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  encrypted_file_key_for_recipient: string;
  nonce: string;
};

/**
 * Encrypt-then-upload: only ciphertext touches Storage. Wraps the random file key for the peer device using {@link SessionCipher}.
 */
export async function sendEncryptedAttachmentMessage(opts: {
  supabase: SupabaseClient;
  cipher: SessionCipher;
  conversationId: string;
  senderUserId: string;
  senderDeviceId: string;
  peerBundle: ParsedPublicKeyBundle;
  peerDeviceId: string;
  plaintextBytes: Uint8Array;
  filename: string;
  mimeType: string;
  caption?: string;
  ttlMs: number | null;
  uploadBlob: UploadEncryptedBlobFn;
  onPhaseProgress: (pct: number, phase: "encrypt" | "upload" | "finalize") => void;
}): Promise<void> {
  const timestampMs = Date.now();
  const expiresAtIso = expiresAtIsoFromTtlMs(opts.ttlMs, timestampMs);

  opts.onPhaseProgress(5, "encrypt");
  const { fileKey, ciphertextBlob } = await encryptAttachmentPlaintext(opts.plaintextBytes);
  opts.onPhaseProgress(40, "encrypt");

  const meta: MessageAssociatedData = {
    conversationId: opts.conversationId,
    senderDeviceId: opts.senderDeviceId,
    recipientDeviceId: opts.peerDeviceId,
    timestampMs,
  };

  const manifest: AttachmentManifest = {
    kind: ATTACHMENT_MANIFEST_KIND,
    filename: opts.filename,
    mimeType: opts.mimeType,
    plaintextByteLength: opts.plaintextBytes.byteLength,
    caption: opts.caption?.trim() || undefined,
  };

  const encryptedBody = await opts.cipher.encryptUtf8(JSON.stringify(manifest), opts.peerBundle, meta);

  const storagePath = `${opts.senderUserId}/${opts.conversationId}/${crypto.randomUUID()}.bin`;

  const uploadBody = new Uint8Array(ciphertextBlob.byteLength);
  uploadBody.set(ciphertextBlob);

  await opts.uploadBlob(storagePath, new Blob([uploadBody], { type: "application/octet-stream" }), (r) => {
    opts.onPhaseProgress(40 + Math.round(r * 55), "upload");
  });

  const row = buildMessageInsertRow({
    conversationId: opts.conversationId,
    senderUserId: opts.senderUserId,
    senderDeviceId: opts.senderDeviceId,
    encrypted: encryptedBody,
    meta: {
      timestampMs,
      conversationId: opts.conversationId,
      senderDeviceId: opts.senderDeviceId,
      recipientDeviceId: opts.peerDeviceId,
    },
    expiresAtIso,
  });

  const { data: inserted, error: msgErr } = await opts.supabase.from("messages").insert(row).select("id").single();
  if (msgErr || !inserted?.id) {
    await opts.supabase.storage.from("attachments").remove([storagePath]);
    throw new Error(msgErr?.message ?? "Message insert failed.");
  }

  const messageId = inserted.id as string;

  opts.onPhaseProgress(96, "finalize");

  const wrappedKey = await opts.cipher.encryptUtf8(bytesToB64(fileKey), opts.peerBundle, meta);

  const attachmentRow: AttachmentInsertRow = {
    message_id: messageId,
    storage_path: storagePath,
    mime_type: opts.mimeType || "application/octet-stream",
    size_bytes: ciphertextBlob.byteLength,
    encrypted_file_key_for_recipient: wrappedKey.ciphertextB64,
    nonce: wrappedKey.nonceB64,
  };

  const { error: attErr } = await opts.supabase.from("attachments").insert(attachmentRow);
  if (attErr) {
    await opts.supabase.from("messages").delete().eq("id", messageId);
    await opts.supabase.storage.from("attachments").remove([storagePath]);
    throw new Error(attErr.message);
  }

  opts.onPhaseProgress(100, "finalize");
}

"use client";

import { Download, FileText, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AttachmentManifest } from "@/lib/crypto/attachment-manifest";
import { decryptAttachmentPlaintext } from "@/lib/crypto/file-crypto";
import { b64ToBytes } from "@/lib/crypto/keys";
import type { EncryptedWirePayload, MessageAssociatedData, ParsedPublicKeyBundle, SessionCipher } from "@/lib/crypto/types";
import { useSupabase } from "@/components/providers/supabase-provider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AttachmentDbRow = {
  storage_path: string;
  mime_type: string;
  encrypted_file_key_for_recipient: string;
  nonce: string;
};

export function AttachmentSecurePreview(props: {
  messageId: string;
  cipher: SessionCipher;
  senderBundle: ParsedPublicKeyBundle;
  meta: MessageAssociatedData;
  attachment: AttachmentDbRow | null;
  manifest: AttachmentManifest;
  mine: boolean;
}) {
  const supabase = useSupabase();
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [decryptedBytes, setDecryptedBytes] = useState<Uint8Array | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!props.attachment) {
        setPhase("idle");
        setDecryptedBytes(null);
        return;
      }
      setPhase("loading");
      setDecryptedBytes(null);
      try {
        const { data: dl, error: dlErr } = await supabase.storage.from("attachments").download(props.attachment.storage_path);
        if (dlErr || !dl) throw new Error(dlErr?.message ?? "Download failed.");

        const encryptedBlob = new Uint8Array(await dl.arrayBuffer());

        const wrapped: EncryptedWirePayload = {
          ciphertextB64: props.attachment.encrypted_file_key_for_recipient,
          nonceB64: props.attachment.nonce,
        };
        const keyB64 = await props.cipher.decryptUtf8(wrapped, props.senderBundle, props.meta);
        const fileKey = b64ToBytes(keyB64);
        const plain = await decryptAttachmentPlaintext(encryptedBlob, fileKey);

        if (cancelled) return;
        setDecryptedBytes(plain);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setPhase("error");
          setDecryptedBytes(null);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when ciphertext pointer changes
  }, [
    props.attachment?.storage_path,
    props.attachment?.encrypted_file_key_for_recipient,
    props.attachment?.nonce,
    props.messageId,
    props.meta.conversationId,
    props.meta.timestampMs,
    props.meta.senderDeviceId,
    props.meta.recipientDeviceId,
    supabase,
    props.cipher,
    props.senderBundle,
  ]);

  const blobUrl = useMemo(() => {
    if (!decryptedBytes || phase !== "ready") return null;
    const bytes = new Uint8Array(decryptedBytes.byteLength);
    bytes.set(decryptedBytes);
    const blob = new Blob([bytes], { type: props.manifest.mimeType });
    return URL.createObjectURL(blob);
  }, [decryptedBytes, phase, props.manifest.mimeType]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const captionColor = props.mine ? "text-primary-foreground/90" : "text-muted-foreground";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/10 px-2 py-1 font-medium dark:bg-white/10">
          <FileText className="size-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="max-w-[220px] truncate">{props.manifest.filename}</span>
        </span>
        <span className={`text-[11px] tabular-nums ${props.mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          Encrypted file · {(props.manifest.plaintextByteLength / 1024).toFixed(1)} KB plaintext
        </span>
      </div>

      {props.manifest.caption ? <p className={`whitespace-pre-wrap text-[15px] leading-relaxed ${captionColor}`}>{props.manifest.caption}</p> : null}

      {!props.attachment ? (
        <p className={`flex items-center gap-2 text-sm ${props.mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Waiting for encrypted attachment metadata…
        </p>
      ) : null}

      {props.attachment && phase === "loading" ? (
        <p className={`flex items-center gap-2 text-sm ${props.mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Decrypting attachment locally…
        </p>
      ) : null}

      {phase === "error" ? (
        <p className="text-sm text-destructive">Could not decrypt this attachment.</p>
      ) : null}

      {phase === "ready" && blobUrl && props.manifest.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob URLs from local decrypt only
        <img
          src={blobUrl}
          alt=""
          className="max-h-[min(360px,55vh)] w-full rounded-xl border border-black/10 object-contain dark:border-white/10"
        />
      ) : null}

      {phase === "ready" && blobUrl && !props.manifest.mimeType.startsWith("image/") ? (
        <a
          href={blobUrl}
          download={props.manifest.filename}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "inline-flex rounded-xl gap-2")}
        >
          <Download className="size-4" aria-hidden />
          Download decrypted file
        </a>
      ) : null}
    </div>
  );
}

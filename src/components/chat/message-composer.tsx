"use client";

import { Paperclip, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { sendEncryptedAttachmentMessage } from "@/lib/chat/send-encrypted-attachment";
import { buildMessageInsertRow } from "@/lib/crypto/message-payload";
import type { MessageAssociatedData, ParsedPublicKeyBundle } from "@/lib/crypto/types";
import { EXPIRY_CHOICES, expiresAtIsoFromTtlMs, type ExpiryChoiceId } from "@/lib/message-expiry";
import { useSupabase } from "@/components/providers/supabase-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uploadEncryptedAttachmentViaXhr } from "@/lib/supabase/storage-upload-xhr";
import { useCipherSession } from "@/stores/cipher-session";

const PLAINTEXT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export function MessageComposer(props: {
  conversationId: string;
  senderUserId: string;
  peerBundle: ParsedPublicKeyBundle | null;
  peerDeviceId: string | null;
  disabled: boolean;
  onTypingBurst: () => void;
  onSent: () => void;
}) {
  const supabase = useSupabase();
  const cipher = useCipherSession((s) => s.cipher);
  const deviceId = useCipherSession((s) => s.deviceId);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoiceId>("off");
  const [progress, setProgress] = useState<{ pct: number; phase: string } | null>(null);

  const lastTypingSentAt = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ttlMs = useMemo(() => EXPIRY_CHOICES.find((c) => c.id === expiryChoice)?.ttlMs ?? null, [expiryChoice]);

  const keysReady = Boolean(props.peerBundle && props.peerDeviceId);

  const canSendText = Boolean(
    cipher && deviceId && props.peerDeviceId && props.peerBundle && text.trim().length > 0 && !props.disabled && !busy,
  );

  const canSendAttachment = Boolean(
    cipher &&
      deviceId &&
      props.peerDeviceId &&
      props.peerBundle &&
      pendingFile &&
      !props.disabled &&
      !busy &&
      pendingFile.size <= PLAINTEXT_ATTACHMENT_MAX_BYTES,
  );

  const canSubmit = canSendText || canSendAttachment;

  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentAt.current < 900) return;
    lastTypingSentAt.current = now;
    props.onTypingBurst();
  }

  async function sendTextMessage() {
    const trimmed = text.trim();
    if (!cipher || !deviceId || !props.peerDeviceId || !props.peerBundle || trimmed.length === 0) return;

    setBusy(true);
    try {
      const timestampMs = Date.now();
      const expiresAtIso = expiresAtIsoFromTtlMs(ttlMs, timestampMs);
      const meta: MessageAssociatedData = {
        conversationId: props.conversationId,
        senderDeviceId: deviceId,
        recipientDeviceId: props.peerDeviceId,
        timestampMs,
      };

      const encrypted = await cipher.encryptUtf8(trimmed, props.peerBundle, meta);
      const row = buildMessageInsertRow({
        conversationId: props.conversationId,
        senderUserId: props.senderUserId,
        senderDeviceId: deviceId,
        encrypted,
        meta: {
          timestampMs,
          conversationId: props.conversationId,
          senderDeviceId: deviceId,
          recipientDeviceId: props.peerDeviceId,
        },
        expiresAtIso,
      });

      const { error } = await supabase.from("messages").insert(row);
      if (error) {
        toast.error(error.message);
        return;
      }

      setText("");
      props.onSent();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function sendAttachmentMessage() {
    const file = pendingFile;
    if (!cipher || !deviceId || !props.peerDeviceId || !props.peerBundle || !file) return;
    if (file.size > PLAINTEXT_ATTACHMENT_MAX_BYTES) {
      toast.error("File too large (max 50 MB).");
      return;
    }

    setBusy(true);
    setProgress({ pct: 0, phase: "encrypt" });
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      await sendEncryptedAttachmentMessage({
        supabase,
        cipher,
        conversationId: props.conversationId,
        senderUserId: props.senderUserId,
        senderDeviceId: deviceId,
        peerBundle: props.peerBundle,
        peerDeviceId: props.peerDeviceId,
        plaintextBytes: buf,
        filename: file.name || "attachment.bin",
        mimeType: file.type || "application/octet-stream",
        caption: text.trim() || undefined,
        ttlMs,
        uploadBlob: async (path, blob, onUploadProgress) => {
          await uploadEncryptedAttachmentViaXhr(supabase, "attachments", path, blob, onUploadProgress);
        },
        onPhaseProgress: (pct, phase) => setProgress({ pct, phase }),
      });

      setText("");
      setPendingFile(null);
      props.onSent();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Attachment send failed.";
      toast.error(msg);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function onSubmit() {
    if (pendingFile) {
      await sendAttachmentMessage();
      return;
    }
    await sendTextMessage();
  }

  return (
    <div className="border-t border-border/50 bg-background/50 px-4 py-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/35">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="whitespace-nowrap font-medium text-foreground/80">Expires</span>
            <select
              className="h-9 rounded-xl border border-border/60 bg-muted/10 px-3 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={expiryChoice}
              disabled={busy || props.disabled || !keysReady}
              onChange={(e) => setExpiryChoice(e.target.value as ExpiryChoiceId)}
            >
              {EXPIRY_CHOICES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Timers delete ciphertext after expiry — not screenshots or copies elsewhere.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf,.pdf,text/plain,.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPendingFile(f ?? null);
            e.target.value = "";
          }}
        />

        <Textarea
          value={text}
          disabled={props.disabled || busy || !keysReady}
          onChange={(e) => {
            setText(e.target.value);
            notifyTyping();
          }}
          placeholder={
            keysReady
              ? pendingFile
                ? "Optional caption (encrypted with the file manifest)…"
                : "Write a message… (encrypted before sync)"
              : "Waiting for peer device keys…"
          }
          className="min-h-[96px] resize-none rounded-2xl border-border/60 bg-muted/10 shadow-inner shadow-black/[0.03]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit) void onSubmit();
            }
          }}
        />

        {progress ? (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span className="capitalize">{progress.phase}</span>
              <span>{progress.pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl gap-2"
              disabled={props.disabled || busy || !keysReady}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" aria-hidden />
              Attach
            </Button>
            {pendingFile ? (
              <span className="inline-flex max-w-[min(100%,240px)] items-center gap-2 rounded-xl border border-border/60 bg-muted/15 px-3 py-1.5 text-xs">
                <span className="truncate font-medium">{pendingFile.name}</span>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Remove attachment"
                  onClick={() => setPendingFile(null)}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ) : null}
            <p className="max-w-[min(100%,20rem)] text-xs leading-snug text-muted-foreground">
              Files are encrypted in-browser; Storage receives ciphertext only (under 50&nbsp;MB).
            </p>
          </div>
          <Button className="h-10 shrink-0 rounded-xl px-6 font-medium" disabled={!canSubmit} onClick={() => void onSubmit()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

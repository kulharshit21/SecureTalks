"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  BadgeCheck,
  Check,
  CheckCheck,
  Loader2,
  Lock,
  Server,
  ShieldCheck,
  ShieldQuestion,
  Timer,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import { AttachmentSecurePreview, type AttachmentDbRow } from "@/components/chat/attachment-secure-preview";
import { VerificationModal } from "@/components/chat/verification-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  fetchPeerUserIdForDirectConversation,
  fetchPrimaryPeerPublicBundle,
  fetchPublicBundleJsonForDevice,
} from "@/lib/conversation-service";
import { tryParseAttachmentManifest } from "@/lib/crypto/attachment-manifest";
import type { AttachmentManifest } from "@/lib/crypto/attachment-manifest";
import { messageMetaFromWire } from "@/lib/crypto/message-meta";
import { isPeerVerifiedLocally } from "@/lib/local-verification";
import { isMessageExpired } from "@/lib/message-expiry";
import type { EncryptedWirePayload, ParsedPublicKeyBundle } from "@/lib/crypto/types";
import { parsePublicKeyBundleJson } from "@/lib/crypto/session";
import { useCipherSession } from "@/stores/cipher-session";

import { MessageComposer } from "./message-composer";

type AssociatedDataRow = {
  timestamp_ms?: number;
  conversation_id?: string;
  sender_device_id?: string;
  recipient_device_id?: string;
};

type WireMessage = {
  id: string;
  conversation_id: string;
  sender_device_id: string;
  sender_id: string;
  ciphertext: string;
  nonce: string;
  algorithm: string;
  associated_data: AssociatedDataRow;
  created_at: string;
  expires_at?: string | null;
};

type ReceiptWire = {
  message_id: string;
  user_id: string;
  status: "sent" | "delivered" | "read";
};

function ReceiptGlyph(props: { status: ReceiptWire["status"]; className?: string }) {
  if (props.status === "read") {
    return <CheckCheck className={props.className ?? "size-3.5 text-sky-500 dark:text-sky-400"} strokeWidth={2.25} aria-hidden />;
  }
  if (props.status === "delivered") {
    return (
      <CheckCheck className={props.className ?? "size-3.5 text-muted-foreground/65"} strokeWidth={2.25} aria-hidden />
    );
  }
  return <Check className={props.className ?? "size-3.5 text-muted-foreground/55"} strokeWidth={2.25} aria-hidden />;
}

export function ChatThread(props: { conversationId: string; userId: string }) {
  const supabase = useSupabase();
  const cipher = useCipherSession((s) => s.cipher);
  const deviceId = useCipherSession((s) => s.deviceId);
  const privateCrypto = useCipherSession((s) => s.privateCrypto);

  const [peerUserId, setPeerUserId] = useState<string | null>(null);
  const [peerDeviceId, setPeerDeviceId] = useState<string | null>(null);
  const [peerBundle, setPeerBundle] = useState<ParsedPublicKeyBundle | null>(null);
  const [peerLabel, setPeerLabel] = useState("Contact");

  const [messages, setMessages] = useState([] as WireMessage[]);
  const [plaintextById, setPlaintextById] = useState(() => new Map<string, string>());
  const [attachmentManifestById, setAttachmentManifestById] = useState(() => new Map<string, AttachmentManifest>());
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState(() => new Map<string, AttachmentDbRow>());
  const [senderBundleByDeviceId, setSenderBundleByDeviceId] = useState(() => new Map<string, ParsedPublicKeyBundle>());
  const [decryptErrById, setDecryptErrById] = useState(() => new Map<string, string>());
  const senderBundleCache = useRef(new Map<string, ParsedPublicKeyBundle>());
  const realtimeChannel = useRef<RealtimeChannel | null>(null);
  const messageIdsRef = useRef(new Set<string>());

  const [peerReceipts, setPeerReceipts] = useState(() => new Map<string, ReceiptWire["status"]>());
  const [typingPeers, setTypingPeers] = useState(() => new Set<string>());

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verificationBump, setVerificationBump] = useState(0);

  const [nowTick, bumpNow] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = window.setInterval(() => bumpNow(), 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages]);

  const visibleMessages = useMemo(
    () => messages.filter((m) => !isMessageExpired(m.expires_at, new Date())),
    [messages, nowTick], // eslint-disable-line react-hooks/exhaustive-deps -- nowTick bumps clock for expiry-only transitions
  );

  const peerVerified = useMemo(
    () => (peerUserId ? isPeerVerifiedLocally(peerUserId) : false),
    // verificationBump intentionally invalidates after local verify (localStorage write).
    [peerUserId, verificationBump], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    let cancelled = false;
    if (!peerUserId) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("username, display_name").eq("id", peerUserId).maybeSingle();
      if (cancelled || !data) return;
      const dn = (data.display_name as string) || "";
      const un = (data.username as string) || "";
      setPeerLabel(dn.trim() || un || "Contact");
    })();
    return () => {
      cancelled = true;
    };
  }, [peerUserId, supabase]);

  async function resolveSenderBundle(senderDeviceId: string): Promise<ParsedPublicKeyBundle | null> {
    const cached = senderBundleCache.current.get(senderDeviceId);
    if (cached) return cached;
    const json = await fetchPublicBundleJsonForDevice(supabase, senderDeviceId);
    if (!json) return null;
    const parsed = parsePublicKeyBundleJson(json);
    senderBundleCache.current.set(senderDeviceId, parsed);
    return parsed;
  }

  async function ensureAttachmentRow(messageId: string) {
    for (let i = 0; i < 8; i++) {
      const { data } = await supabase
        .from("attachments")
        .select("storage_path, mime_type, encrypted_file_key_for_recipient, nonce")
        .eq("message_id", messageId)
        .maybeSingle();
      if (data) {
        setAttachmentsByMessageId((prev) => new Map(prev).set(messageId, data as AttachmentDbRow));
        return;
      }
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }

  async function decryptRow(row: WireMessage): Promise<void> {
    if (!cipher || !deviceId || !peerDeviceId) return;
    try {
      const senderBundle = await resolveSenderBundle(row.sender_device_id);
      if (!senderBundle) throw new Error("Missing sender public bundle.");

      const meta = messageMetaFromWire(row, deviceId, peerDeviceId);
      if (!meta) throw new Error("Missing decrypt meta.");

      setSenderBundleByDeviceId((prev) => new Map(prev).set(row.sender_device_id, senderBundle));

      const payload: EncryptedWirePayload = { ciphertextB64: row.ciphertext, nonceB64: row.nonce };
      const plain = await cipher.decryptUtf8(payload, senderBundle, meta);

      const manifest = tryParseAttachmentManifest(plain);
      if (manifest) {
        setAttachmentManifestById((prev) => new Map(prev).set(row.id, manifest));
        setPlaintextById((prev) => {
          const next = new Map(prev);
          next.delete(row.id);
          return next;
        });
        void ensureAttachmentRow(row.id);
      } else {
        setPlaintextById((prev) => new Map(prev).set(row.id, plain));
        setAttachmentManifestById((prev) => {
          const next = new Map(prev);
          next.delete(row.id);
          return next;
        });
      }

      setDecryptErrById((prev) => {
        const next = new Map(prev);
        next.delete(row.id);
        return next;
      });
    } catch {
      setDecryptErrById((prev) => new Map(prev).set(row.id, "unlock_failed"));
    }
  }

  async function refreshReceipts(outgoingIds: string[]) {
    if (!peerUserId || outgoingIds.length === 0) return;
    const { data, error } = await supabase
      .from("message_receipts")
      .select("message_id, user_id, delivered_at, read_at")
      .eq("user_id", peerUserId)
      .in("message_id", outgoingIds);

    if (error) return;

    setPeerReceipts(() => {
      const next = new Map<string, ReceiptWire["status"]>();
      for (const row of data ?? []) {
        const readAt = row.read_at as string | null;
        const deliveredAt = row.delivered_at as string | null;
        let status: ReceiptWire["status"];
        if (readAt) status = "read";
        else if (deliveredAt) status = "delivered";
        else status = "sent";
        next.set(row.message_id as string, status);
      }
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    senderBundleCache.current = new Map();

    (async () => {
      const peerId = await fetchPeerUserIdForDirectConversation(supabase, props.conversationId, props.userId);
      if (cancelled) return;
      setPeerUserId(peerId);

      if (!peerId) {
        setPeerBundle(null);
        setPeerDeviceId(null);
        return;
      }

      const peer = await fetchPrimaryPeerPublicBundle(supabase, peerId);
      if (cancelled) return;
      if (!peer) {
        setPeerBundle(null);
        setPeerDeviceId(null);
        return;
      }

      try {
        setPeerBundle(parsePublicKeyBundleJson(peer.bundleJson));
        setPeerDeviceId(peer.deviceId);
      } catch {
        setPeerBundle(null);
        setPeerDeviceId(peer.deviceId);
      }
    })().catch(() => {
      if (!cancelled) toast.error("Unable to resolve peer keys.");
    });

    return () => {
      cancelled = true;
    };
  }, [props.conversationId, props.userId, supabase]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setAttachmentManifestById(new Map());
      setAttachmentsByMessageId(new Map());
      setSenderBundleByDeviceId(new Map());

      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, sender_device_id, ciphertext, nonce, algorithm, associated_data, created_at, expires_at",
        )
        .eq("conversation_id", props.conversationId)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        return;
      }

      const rows = (data ?? []) as WireMessage[];
      setMessages(rows);
      await Promise.all(rows.map((r) => decryptRow(r)));

      const outgoing = rows.filter((r) => r.sender_device_id === deviceId).map((r) => r.id);
      await refreshReceipts(outgoing);
    })().catch(() => {
      if (!cancelled) toast.error("Unable to load messages.");
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- conversation reload; omitting refreshReceipts/decryptRow avoids churn
  }, [props.conversationId, supabase, cipher, deviceId, peerDeviceId, peerBundle]);

  useEffect(() => {
    const outgoingIds = messages.filter((m) => m.sender_device_id === deviceId).map((m) => m.id);
    if (outgoingIds.length === 0) return;

    const handle = window.setInterval(() => {
      void refreshReceipts(outgoingIds);
    }, 5000);

    return () => window.clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timer snapshots outgoingIds; refreshReceipts intentionally omitted
  }, [deviceId, messages, peerUserId, supabase]);

  useEffect(() => {
    const topic = `conversation:${props.conversationId}`;
    const channel = supabase
      .channel(topic, { config: { broadcast: { ack: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const peerId = String((payload as { userId?: string }).userId ?? "");
        if (!peerId || peerId === props.userId) return;

        setTypingPeers((prev) => new Set(prev).add(peerId));

        window.setTimeout(() => {
          setTypingPeers((prev) => {
            const next = new Set(prev);
            next.delete(peerId);
            return next;
          });
        }, 2500);
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${props.conversationId}` },
        async (payload) => {
          const row = payload.new as WireMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          await decryptRow(row);

          if (row.sender_device_id !== deviceId) {
            const now = new Date().toISOString();
            await supabase.from("message_receipts").upsert(
              {
                message_id: row.id,
                user_id: props.userId,
                delivered_at: now,
                read_at: now,
              },
              { onConflict: "message_id,user_id" },
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attachments" },
        (payload) => {
          const row = payload.new as AttachmentDbRow & { message_id?: string };
          const mid = row.message_id;
          if (!mid || !messageIdsRef.current.has(mid)) return;
          const slim: AttachmentDbRow = {
            storage_path: row.storage_path,
            mime_type: row.mime_type,
            encrypted_file_key_for_recipient: row.encrypted_file_key_for_recipient,
            nonce: row.nonce,
          };
          setAttachmentsByMessageId((prev) => new Map(prev).set(mid, slim));
        },
      );

    realtimeChannel.current = channel;

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        toast.error("Realtime channel error.");
      }
    });

    return () => {
      realtimeChannel.current = null;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- realtime handlers close over decryptRow/cipher by design
  }, [deviceId, props.conversationId, props.userId, supabase]);

  const typingLabel = useMemo(() => {
    if (typingPeers.size === 0) return null;
    return `Typing…`;
  }, [typingPeers.size]);

  function sendTypingBurst() {
    const ch = realtimeChannel.current;
    if (!ch) return;
    void ch.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: props.userId },
    });
  }

  const disabledComposer = !cipher || !deviceId;
  const e2eeReady = Boolean(cipher && deviceId);

  return (
    <TooltipProvider delay={400}>
      <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-background to-muted/15">
        <div className="shrink-0 border-b border-border/50 bg-background/85 px-4 py-4 backdrop-blur-xl md:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">{peerLabel}</h1>
                  {peerVerified ? (
                    <Badge variant="secondary" className="gap-1 rounded-lg border-emerald-500/25 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-400">
                      <BadgeCheck className="size-3.5" aria-hidden />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 rounded-lg font-normal text-muted-foreground">
                      <ShieldQuestion className="size-3.5" aria-hidden />
                      Not verified
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-medium text-foreground/90">
                    <Lock className="size-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    E2EE active
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-0.5">
                    <Server className="size-3" aria-hidden />
                    Server-blind storage
                  </span>
                  {!e2eeReady ? (
                    <span className="text-amber-600 dark:text-amber-400">Unlock device keys to send</span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-start">
                <p className="max-w-xs text-right text-[11px] leading-snug text-muted-foreground sm:text-left">
                  Disappearing timers remove ciphertext after expiry. Screenshots and recordings are still possible on any device.
                </p>
                <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-xl gap-2" onClick={() => setVerifyOpen(true)}>
                  <UserCheck className="size-4" aria-hidden />
                  Verify
                </Button>
              </div>
            </div>

            <Separator className="opacity-40" />
            {typingLabel ? (
              <p className="text-xs font-medium text-muted-foreground animate-in fade-in duration-200">{typingLabel}</p>
            ) : null}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-3 py-6 md:gap-3 md:px-5">
            {messages.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border/60 bg-card/30 px-8 py-20 text-center animate-in fade-in zoom-in-95 duration-300">
                <ShieldCheck className="mx-auto mb-4 size-10 text-primary/80" aria-hidden />
                <p className="text-sm font-semibold tracking-tight">No messages yet</p>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Your draft stays on-device until you send. Only ciphertext crosses the wire.
                </p>
              </div>
            ) : visibleMessages.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border/60 bg-card/30 px-8 py-16 text-center">
                <Timer className="mx-auto mb-4 size-10 text-muted-foreground" aria-hidden />
                <p className="text-sm font-semibold tracking-tight">No visible messages</p>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Earlier messages may have expired and were removed from your devices and storage.
                </p>
              </div>
            ) : (
              visibleMessages.map((m) => {
                const mine = m.sender_device_id === deviceId;
                const plain = plaintextById.get(m.id);
                const manifest = attachmentManifestById.get(m.id);
                const attachmentRow = attachmentsByMessageId.get(m.id);
                const senderBundleForMsg = senderBundleByDeviceId.get(m.sender_device_id);
                const meta =
                  deviceId && peerDeviceId ? messageMetaFromWire(m, deviceId, peerDeviceId) : null;
                const err = decryptErrById.get(m.id);
                const receipt = peerReceipts.get(m.id);
                const timeStr = new Date(m.created_at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                });

                const receiptIconClass = mine
                  ? receipt === "read"
                    ? "size-3.5 text-sky-200"
                    : receipt === "delivered"
                      ? "size-3.5 text-primary-foreground/75"
                      : "size-3.5 text-primary-foreground/55"
                  : undefined;

                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} animate-in fade-in duration-200`}>
                    <div
                      className={`group relative max-w-[min(560px,88vw)] rounded-[22px] px-4 py-3 shadow-sm transition-all ${
                        mine
                          ? "bg-primary text-primary-foreground shadow-primary/15"
                          : "border border-border/60 bg-card/90 text-card-foreground backdrop-blur-sm"
                      }`}
                    >
                      {manifest && meta && cipher && senderBundleForMsg ? (
                        <AttachmentSecurePreview
                          messageId={m.id}
                          cipher={cipher}
                          senderBundle={senderBundleForMsg}
                          meta={meta}
                          attachment={attachmentRow ?? null}
                          manifest={manifest}
                          mine={mine}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                          {plain ?? (err ? "Unable to show this message." : null)}
                          {!plain && !manifest && !err ? (
                            <span className="inline-flex items-center gap-2 text-sm opacity-80">
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                              Decrypting…
                            </span>
                          ) : null}
                        </p>
                      )}
                      <div
                        className={`mt-2 flex items-center gap-2 text-[11px] tabular-nums ${
                          mine ? "justify-end text-primary-foreground/75" : "justify-start text-muted-foreground"
                        }`}
                      >
                        {m.expires_at ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="inline-flex cursor-default opacity-80">
                                  <Timer className="size-3.5" aria-hidden />
                                </span>
                              }
                            />
                            <TooltipContent side="top" className="max-w-[240px] text-xs">
                              Expires {new Date(m.expires_at).toLocaleString()}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                        <span>{timeStr}</span>
                        {mine ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="inline-flex cursor-default">
                                  <ReceiptGlyph status={receipt ?? "sent"} className={receiptIconClass} />
                                </span>
                              }
                            />
                            <TooltipContent side="top" className="text-xs capitalize">
                              {(receipt ?? "sent").replace("_", " ")}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <MessageComposer
          conversationId={props.conversationId}
          senderUserId={props.userId}
          peerBundle={peerBundle}
          peerDeviceId={peerDeviceId}
          disabled={disabledComposer}
          onTypingBurst={sendTypingBurst}
          onSent={() => {
            void refreshReceipts(messages.filter((m) => m.sender_device_id === deviceId).map((m) => m.id));
          }}
        />

        <VerificationModal
          open={verifyOpen}
          onOpenChange={setVerifyOpen}
          peerUserId={peerUserId}
          peerLabel={peerLabel}
          peerBundle={peerBundle}
          myIdentityDhPublicKey={privateCrypto?.identityDh.publicKey ?? null}
          peerVerified={peerVerified}
          onVerifiedChange={() => setVerificationBump((n) => n + 1)}
        />
      </div>
    </TooltipProvider>
  );
}

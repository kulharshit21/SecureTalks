"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  BadgeCheck,
  Check,
  CheckCheck,
  Flag,
  KeyRound,
  ListChecks,
  Loader2,
  Lock,
  Server,
  ShieldCheck,
  ShieldQuestion,
  Timer,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AttachmentSecurePreview, type AttachmentDbRow } from "@/components/chat/attachment-secure-preview";
import { AiFeaturesBanner } from "@/components/chat/ai-features-banner";
import { AiReportAnalysisDialog, AiSummarizeExportDialog } from "@/components/chat/ai-export-dialog";
import { VerificationModal } from "@/components/chat/verification-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  fetchPeerUserIdForDirectConversation,
  fetchPrimaryPeerPublicBundle,
  fetchPublicBundleJsonForDevice,
  searchProfilesRpc,
} from "@/lib/conversation-service";
import { tryParseAttachmentManifest } from "@/lib/crypto/attachment-manifest";
import type { AttachmentManifest } from "@/lib/crypto/attachment-manifest";
import { decryptGroupUtf8, GROUP_PROTOCOL_ID } from "@/lib/crypto/group-crypto";
import { messageMetaFromWire } from "@/lib/crypto/message-meta";
import {
  fetchActiveMemberUserIds,
  fetchConversationShell,
  fetchGroupEpochsDescending,
  fetchMyMembership,
  fetchPrimaryDeviceIdsForUsers,
  fetchWrapForRecipient,
  groupAddMemberRpc,
  groupRemoveMemberRpc,
  publishGroupEpochKey,
  unwrapGroupKeyFromWrap,
  verifyLatestEpochWrapCoverage,
} from "@/lib/group-service";
import { isPeerVerifiedLocally } from "@/lib/local-verification";
import { hasAcceptedAiConsent } from "@/lib/ai/consent-storage";
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
  group_epoch?: number;
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

  const [verificationBump, setVerificationBump] = useState(0);

  const [aiExportSelectMode, setAiExportSelectMode] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const [exportSnippet, setExportSnippet] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSnippet, setReportSnippet] = useState("");
  const [summarizeEpoch, setSummarizeEpoch] = useState(0);
  const [reportEpoch, setReportEpoch] = useState(0);
  const [aiConsentAck, setAiConsentAck] = useState(() => hasAcceptedAiConsent());

  const [convKind, setConvKind] = useState<"direct" | "group" | null>(null);
  const [convTitle, setConvTitle] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<"admin" | "member" | null>(null);
  const [groupMembers, setGroupMembers] = useState<Array<{ id: string; username: string; display_name: string }>>([]);
  const [groupSendCtx, setGroupSendCtx] = useState<{ epoch: number; groupKey: Uint8Array } | null>(null);
  const [groupCryptoWarning, setGroupCryptoWarning] = useState<string | null>(null);
  const [suggestKeyRotation, setSuggestKeyRotation] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberQuery, setAddMemberQuery] = useState("");
  const [addMemberResults, setAddMemberResults] = useState<Array<{ id: string; username: string; display_name: string }>>([]);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyTargetUserId, setVerifyTargetUserId] = useState<string | null>(null);
  const [verifyTargetLabel, setVerifyTargetLabel] = useState("");
  const [verifyTargetBundle, setVerifyTargetBundle] = useState<ParsedPublicKeyBundle | null>(null);

  const groupEpochKeysRef = useRef(new Map<number, Uint8Array>());
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

  const peerReplyContextLines = useMemo(() => {
    const lines: string[] = [];
    for (const m of visibleMessages) {
      if (!deviceId || m.sender_device_id === deviceId) continue;
      const plain = plaintextById.get(m.id);
      if (!plain?.trim()) continue;
      lines.push(plain.trim());
    }
    return lines;
  }, [visibleMessages, plaintextById, deviceId]);

  function toggleExportSelection(messageId: string) {
    setSelectedExportIds((prev) => (prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]));
  }

  function buildExportFromSelection(ids: string[]): string {
    const wanted = new Set(ids);
    const lines: string[] = [];
    for (const m of visibleMessages) {
      if (!wanted.has(m.id)) continue;
      const plain = plaintextById.get(m.id)?.trim();
      if (!plain) continue;
      const mine = deviceId ? m.sender_device_id === deviceId : false;
      const who =
        mine ? "Me" : convKind === "group" ? `Member ${(m.sender_id as string).slice(0, 8)}…` : peerLabel;
      const ts = new Date(m.created_at).toLocaleString();
      lines.push(`[${ts}] ${who}: ${plain}`);
    }
    return lines.join("\n\n");
  }

  function openSummarizeFromSelection() {
    const text = buildExportFromSelection(selectedExportIds);
    if (!text.trim()) {
      toast.error("Select at least one decrypted text message to export.");
      return;
    }
    setExportSnippet(text);
    setSummarizeEpoch((n) => n + 1);
    setSummarizeOpen(true);
  }

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
        .select("storage_path, mime_type, encrypted_file_key, nonce")
        .eq("message_id", messageId)
        .maybeSingle();
      if (data) {
        setAttachmentsByMessageId((prev) => new Map(prev).set(messageId, data as AttachmentDbRow));
        return;
      }
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }

  async function reloadGroupMembers(isGroup: boolean) {
    if (!isGroup) {
      setGroupMembers([]);
      setMyRole(null);
      return;
    }
    const mem = await fetchMyMembership(supabase, props.conversationId, props.userId);
    setMyRole(mem?.role ?? null);
    const { data: rows, error } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", props.conversationId)
      .is("left_at", null);
    if (error) throw error;
    const uids = (rows ?? []).map((r) => r.user_id as string);
    if (uids.length === 0) {
      setGroupMembers([]);
      return;
    }
    const { data: profs, error: pErr } = await supabase.from("profiles").select("id, username, display_name").in("id", uids);
    if (pErr) throw pErr;
    const list = (profs ?? []).map((p) => ({
      id: p.id as string,
      username: (p.username as string) ?? "",
      display_name: (p.display_name as string) ?? "",
    }));
    setGroupMembers(list);
  }

  async function reloadGroupKeysForConversation(isGroup: boolean) {
    if (!cipher || !deviceId || !isGroup) return;
    const epochs = await fetchGroupEpochsDescending(supabase, props.conversationId);
    const map = new Map<number, Uint8Array>();
    let warning: string | null = null;
    for (const epoch of epochs) {
      try {
        const wrap = await fetchWrapForRecipient(supabase, epoch.id, deviceId);
        if (!wrap) {
          const latest = epochs.length ? epochs[epochs.length - 1] : undefined;
          if (latest && epoch.id === latest.id) {
            warning =
              "This device is missing the latest group key wrap — key rotation may have failed or not reached every device.";
          }
          continue;
        }
        const key = await unwrapGroupKeyFromWrap(supabase, cipher, deviceId, epoch, wrap);
        map.set(epoch.epoch, key);
      } catch {
        warning =
          "Could not unwrap a group encryption key — rotation may be incomplete or wraps authored by an unreachable device.";
      }
    }
    groupEpochKeysRef.current = map;
    const last = epochs.length ? epochs[epochs.length - 1]! : null;
    if (last && map.has(last.epoch)) {
      setGroupSendCtx({ epoch: last.epoch, groupKey: map.get(last.epoch)! });
    } else {
      setGroupSendCtx(null);
    }
    setGroupCryptoWarning(warning);
  }

  async function handleRotateGroupKeys() {
    if (!cipher || !deviceId || convKind !== "group" || myRole !== "admin") return;
    try {
      const members = await fetchActiveMemberUserIds(supabase, props.conversationId);
      await publishGroupEpochKey({
        supabase,
        cipher,
        conversationId: props.conversationId,
        adminUserId: props.userId,
        adminDeviceId: deviceId,
        memberUserIds: members,
      });
      await reloadGroupKeysForConversation(true);
      const devicesMap = await fetchPrimaryDeviceIdsForUsers(supabase, members);
      const cov = await verifyLatestEpochWrapCoverage({
        supabase,
        conversationId: props.conversationId,
        expectedDeviceCount: devicesMap.size,
      });
      if (!cov.ok) {
        toast.error("Group key rotation may be incomplete — not every primary device received a wrap.");
      } else {
        toast.success(`Group encryption rotated (epoch ${cov.latestEpoch}).`);
      }
      setSuggestKeyRotation(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rotation failed.");
    }
  }

  async function openVerifyForMember(memberUserId: string, label: string) {
    const peer = await fetchPrimaryPeerPublicBundle(supabase, memberUserId);
    if (!peer?.bundleJson) {
      toast.error("That member has no active device keys.");
      return;
    }
    try {
      setVerifyTargetUserId(memberUserId);
      setVerifyTargetLabel(label);
      setVerifyTargetBundle(parsePublicKeyBundleJson(peer.bundleJson));
      setVerifyOpen(true);
    } catch {
      toast.error("Unreadable device bundle.");
    }
  }

  async function decryptRow(row: WireMessage): Promise<void> {
    if (!cipher || !deviceId) return;
    try {
      if (row.algorithm === GROUP_PROTOCOL_ID) {
        const meta = messageMetaFromWire(row, deviceId, null);
        if (!meta?.groupEpoch) throw new Error("Missing group epoch.");
        const gk = groupEpochKeysRef.current.get(meta.groupEpoch);
        if (!gk) {
          setDecryptErrById((prev) => new Map(prev).set(row.id, "group_key_pending"));
          return;
        }
        const payload: EncryptedWirePayload = { ciphertextB64: row.ciphertext, nonceB64: row.nonce };
        const plain = await decryptGroupUtf8(payload, gk, {
          conversationId: row.conversation_id,
          senderDeviceId: row.sender_device_id,
          timestampMs: meta.timestampMs,
          groupEpoch: meta.groupEpoch,
        });

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
        return;
      }

      if (!peerDeviceId) return;

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
        .from("message_recipients")
        .select("message_id, delivered_at, read_at")
        .eq("recipient_user_id", peerUserId)
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
    if (convKind !== "direct") return;

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
  }, [convKind, props.conversationId, props.userId, supabase]);

  async function onGroupCryptoSynced() {
    const shell = await fetchConversationShell(supabase, props.conversationId);
    if (shell?.type !== "group") return;
    await reloadGroupKeysForConversation(true);
    setMessages((prev) => {
      void Promise.all(prev.map((r) => decryptRow(r)));
      return prev;
    });
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      senderBundleCache.current = new Map();

      const shell = await fetchConversationShell(supabase, props.conversationId);
      if (cancelled || !shell) {
        if (!cancelled) toast.error("Conversation not found.");
        return;
      }
      setConvKind(shell.type);
      setConvTitle(shell.title);

      setAttachmentManifestById(new Map());
      setAttachmentsByMessageId(new Map());
      setSenderBundleByDeviceId(new Map());

      const isGroup = shell.type === "group";

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

      if (isGroup && cipher && deviceId) {
        await reloadGroupKeysForConversation(true);
        await reloadGroupMembers(true);
      }

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
    const base = supabase
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
            const { error: rpcErr } = await supabase.rpc("mark_message_read", { message_uuid: row.id });
            if (rpcErr) {
              console.warn("mark_message_read", rpcErr.message);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attachments",
          filter: `conversation_id=eq.${props.conversationId}`,
        },
        (payload) => {
          const row = payload.new as AttachmentDbRow & { message_id?: string };
          const mid = row.message_id;
          if (!mid || !messageIdsRef.current.has(mid)) return;
          const slim: AttachmentDbRow = {
            storage_path: row.storage_path,
            mime_type: row.mime_type,
            encrypted_file_key: row.encrypted_file_key,
            nonce: row.nonce,
          };
          setAttachmentsByMessageId((prev) => new Map(prev).set(mid, slim));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_session_epochs",
          filter: `conversation_id=eq.${props.conversationId}`,
        },
        () => void onGroupCryptoSynced(),
      );

    const channel = deviceId
      ? base.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "group_key_wraps",
            filter: `recipient_device_id=eq.${deviceId}`,
          },
          () => void onGroupCryptoSynced(),
        )
      : base;

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

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const q = addMemberQuery.trim();
      if (!addMemberOpen || q.length < 2) {
        setAddMemberResults([]);
        return;
      }
      try {
        const rows = await searchProfilesRpc(supabase, q);
        if (cancelled) return;
        setAddMemberResults(rows);
      } catch {
        if (!cancelled) toast.error("Search failed.");
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [addMemberOpen, addMemberQuery, supabase]);

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
                  <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">
                    {convKind === "group" ? convTitle ?? "Group" : peerLabel}
                  </h1>
                  {convKind === "direct" ? (
                    peerVerified ? (
                      <Badge variant="secondary" className="gap-1 rounded-lg border-emerald-500/25 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-400">
                        <BadgeCheck className="size-3.5" aria-hidden />
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 rounded-lg font-normal text-muted-foreground">
                        <ShieldQuestion className="size-3.5" aria-hidden />
                        Not verified
                      </Badge>
                    )
                  ) : convKind === "group" ? (
                    <Badge variant="outline" className="gap-1 rounded-lg font-normal text-muted-foreground">
                      <Users className="size-3.5" aria-hidden />
                      Group · MVP symmetric epoch keys
                    </Badge>
                  ) : null}
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
                  {convKind === "group"
                    ? "Production-grade large groups should use MLS (see docs). This MVP encrypts one ciphertext per message using a rotated shared key wrapped to each device."
                    : "Disappearing timers remove ciphertext after expiry. Screenshots and recordings are still possible on any device."}
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  {convKind === "direct" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 rounded-xl gap-2"
                      onClick={() => {
                        setVerifyTargetUserId(null);
                        setVerifyTargetBundle(null);
                        setVerifyOpen(true);
                      }}
                    >
                      <UserCheck className="size-4" aria-hidden />
                      Verify
                    </Button>
                  ) : null}
                  {convKind === "group" && myRole === "admin" ? (
                    <>
                      <Button type="button" variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => setAddMemberOpen(true)}>
                        <Users className="size-4" aria-hidden />
                        Add member
                      </Button>
                      <Button type="button" variant="secondary" size="sm" className="rounded-xl gap-2" onClick={() => void handleRotateGroupKeys()}>
                        <KeyRound className="size-4" aria-hidden />
                        Rotate keys
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            {convKind === "group" ? (
              <div className="flex flex-wrap gap-2 rounded-2xl border border-border/50 bg-muted/10 px-3 py-2">
                {groupMembers.map((gm) => (
                  <div
                    key={gm.id}
                    className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px]"
                  >
                    <span className="font-medium">@{gm.username || gm.id.slice(0, 8)}</span>
                    {isPeerVerifiedLocally(gm.id) ? (
                      <BadgeCheck className="size-3 text-emerald-600" aria-hidden />
                    ) : (
                      <ShieldQuestion className="size-3 text-muted-foreground" aria-hidden />
                    )}
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => void openVerifyForMember(gm.id, gm.display_name || gm.username)}
                    >
                      Verify
                    </button>
                    {myRole === "admin" && gm.id !== props.userId ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 text-rose-600 hover:underline"
                        title="Remove member"
                        aria-label={`Remove ${gm.username}`}
                        onClick={() =>
                          void groupRemoveMemberRpc(supabase, props.conversationId, gm.id)
                            .then(async () => {
                              toast.warning("Member removed — rotate group keys so they cannot read new messages.");
                              setSuggestKeyRotation(true);
                              await reloadGroupMembers(true);
                            })
                            .catch((e) => toast.error(e instanceof Error ? e.message : "Remove failed"))
                        }
                      >
                        <UserMinus className="size-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {convKind === "group" && groupCryptoWarning ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-950 dark:text-amber-100">
                <span className="font-semibold">Group encryption warning:</span> {groupCryptoWarning}
              </div>
            ) : null}

            {convKind === "group" && suggestKeyRotation && myRole === "admin" ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] leading-snug">
                <span className="font-medium text-foreground">
                  Membership changed — rotate the group encryption key when all admins are online when possible.
                </span>
                <Button size="sm" type="button" className="rounded-lg" onClick={() => void handleRotateGroupKeys()}>
                  Rotate now
                </Button>
              </div>
            ) : null}

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
                const exportableText = Boolean(plain?.trim()) && !manifest;
                const attachmentRow = attachmentsByMessageId.get(m.id);
                const senderBundleForMsg = senderBundleByDeviceId.get(m.sender_device_id);
                const meta =
                  deviceId && convKind === "direct" && peerDeviceId
                    ? messageMetaFromWire(m, deviceId, peerDeviceId)
                    : deviceId && convKind === "group"
                      ? messageMetaFromWire(m, deviceId, null)
                      : null;
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
                    <div className={`flex items-start gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}>
                      {aiExportSelectMode && exportableText ? (
                        <label className="mt-3 inline-flex shrink-0 cursor-pointer items-center">
                          <span className="sr-only">Include message in AI export</span>
                          <input
                            type="checkbox"
                            checked={selectedExportIds.includes(m.id)}
                            onChange={() => toggleExportSelection(m.id)}
                            className="size-4 rounded border-border accent-primary"
                          />
                        </label>
                      ) : null}
                      <div
                        className={`group relative max-w-[min(560px,88vw)] rounded-[22px] px-4 py-3 shadow-sm transition-all ${
                          mine
                            ? "bg-primary text-primary-foreground shadow-primary/15"
                            : "border border-border/60 bg-card/90 text-card-foreground backdrop-blur-sm"
                        }`}
                      >
                        {manifest && meta && cipher && senderBundleForMsg && convKind === "direct" ? (
                          <AttachmentSecurePreview
                            messageId={m.id}
                            cipher={cipher}
                            senderBundle={senderBundleForMsg}
                            meta={meta}
                            attachment={attachmentRow ?? null}
                            manifest={manifest}
                            mine={mine}
                          />
                        ) : manifest && convKind === "group" ? (
                          <p className="text-sm opacity-90">
                            Attachment payloads are not previewed for group chats in this MVP (pairwise file keys differ).
                          </p>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                            {plain ??
                              (err === "group_key_pending"
                                ? "Waiting for group encryption key…"
                                : err
                                  ? "Unable to show this message."
                                  : null)}
                            {!plain && !manifest && !err ? (
                              <span className="inline-flex items-center gap-2 text-sm opacity-80">
                                <Loader2 className="size-4 animate-spin" aria-hidden />
                                Decrypting…
                              </span>
                            ) : null}
                          </p>
                        )}
                        <div
                          className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums ${
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
                          {exportableText ? (
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1 underline underline-offset-2 opacity-85 hover:opacity-100 ${
                                mine ? "text-primary-foreground/90" : "text-muted-foreground"
                              }`}
                              onClick={() => {
                                setReportEpoch((n) => n + 1);
                                setReportSnippet(plain!.trim());
                                setReportOpen(true);
                              }}
                            >
                              <Flag className="size-3 shrink-0" aria-hidden />
                              Abuse analysis (AI)
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t border-border/40 bg-background/80 px-4 py-3 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55 md:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            <AiFeaturesBanner />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={aiExportSelectMode ? "secondary" : "outline"}
                size="sm"
                className="rounded-xl gap-2"
                disabled={visibleMessages.length === 0}
                onClick={() => {
                  setAiExportSelectMode((on) => {
                    if (on) setSelectedExportIds([]);
                    return !on;
                  });
                }}
              >
                <ListChecks className="size-4" aria-hidden />
                {aiExportSelectMode ? "Done selecting" : "Select messages to summarize"}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="rounded-xl"
                disabled={!aiExportSelectMode || selectedExportIds.length === 0}
                onClick={() => openSummarizeFromSelection()}
              >
                Review export & summarize…
              </Button>
              {aiExportSelectMode ? (
                <span className="text-[11px] text-muted-foreground">
                  {selectedExportIds.length} selected — only checked lines are included.
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <MessageComposer
          conversationId={props.conversationId}
          conversationKind={convKind ?? "direct"}
          senderUserId={props.userId}
          peerBundle={peerBundle}
          peerDeviceId={peerDeviceId}
          groupSendCtx={convKind === "group" ? groupSendCtx : null}
          disabled={disabledComposer}
          peerReplyContextLines={peerReplyContextLines}
          onTypingBurst={sendTypingBurst}
          onSent={() => {
            void refreshReceipts(messages.filter((m) => m.sender_device_id === deviceId).map((m) => m.id));
          }}
        />

        <AiSummarizeExportDialog
          open={summarizeOpen}
          mountEpoch={summarizeEpoch}
          onOpenChange={(open) => {
            setSummarizeOpen(open);
            if (!open) {
              setAiExportSelectMode(false);
              setSelectedExportIds([]);
            }
          }}
          initialExportText={exportSnippet}
          hasConsent={aiConsentAck}
          onConsentGranted={() => setAiConsentAck(true)}
        />
        <AiReportAnalysisDialog
          open={reportOpen}
          mountEpoch={reportEpoch}
          onOpenChange={setReportOpen}
          reportedSnippet={reportSnippet}
          hasConsent={aiConsentAck}
          onConsentGranted={() => setAiConsentAck(true)}
        />

        <VerificationModal
          open={verifyOpen}
          onOpenChange={(o) => {
            setVerifyOpen(o);
            if (!o) {
              setVerifyTargetUserId(null);
              setVerifyTargetBundle(null);
            }
          }}
          peerUserId={verifyTargetUserId ?? peerUserId}
          peerLabel={verifyTargetUserId ? verifyTargetLabel : peerLabel}
          peerBundle={verifyTargetBundle ?? peerBundle}
          myIdentityDhPublicKey={privateCrypto?.identityDh.publicKey ?? null}
          peerVerified={verifyTargetUserId ? isPeerVerifiedLocally(verifyTargetUserId) : peerVerified}
          onVerifiedChange={() => setVerificationBump((n) => n + 1)}
        />

        <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add group member</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Input
                placeholder="Search username…"
                value={addMemberQuery}
                onChange={(e) => setAddMemberQuery(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border/60">
                {addMemberQuery.trim().length < 2 ? (
                  <p className="p-4 text-xs text-muted-foreground">Type at least two characters.</p>
                ) : addMemberResults.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground">No matches.</p>
                ) : (
                  addMemberResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-muted/40"
                      onClick={() =>
                        void groupAddMemberRpc(supabase, props.conversationId, r.id)
                          .then(async () => {
                            toast.success("Member added — rotate keys so they receive the symmetric group key.");
                            setSuggestKeyRotation(true);
                            setAddMemberOpen(false);
                            await reloadGroupMembers(true);
                          })
                          .catch((e) => toast.error(e instanceof Error ? e.message : "Add failed"))
                      }
                    >
                      <span>{r.username}</span>
                      <span className="truncate pl-2 text-xs text-muted-foreground">{r.display_name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" className="rounded-xl" onClick={() => setAddMemberOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

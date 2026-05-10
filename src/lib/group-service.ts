import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decodeGroupKeyWrapPayload,
  encodeGroupKeyWrapPayload,
  generateGroupSymmetricKey,
} from "@/lib/crypto/group-crypto";
import { parsePublicKeyBundleJson } from "@/lib/crypto/session";
import type { MessageAssociatedData } from "@/lib/crypto/types";
import type { SessionCipher } from "@/lib/crypto/types";
import { fetchPrimaryPeerPublicBundle, fetchPublicBundleJsonForDevice } from "@/lib/conversation-service";

export type GroupEpochRow = {
  id: string;
  conversation_id: string;
  epoch: number;
  created_by_device_id: string;
  created_by_user_id: string;
};

export type GroupKeyWrapRow = {
  epoch_id: string;
  recipient_device_id: string;
  author_device_id: string;
  ciphertext: string;
  nonce: string;
  algorithm: string;
  associated_data: Record<string, unknown>;
};

export async function createGroupRpc(supabase: SupabaseClient, title: string, memberUserIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc("create_group", {
    p_title: title,
    p_member_user_ids: memberUserIds,
  });
  if (error) throw error;
  return data as string;
}

export async function groupAddMemberRpc(supabase: SupabaseClient, conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("group_add_member", {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function groupRemoveMemberRpc(
  supabase: SupabaseClient,
  conversationId: string,
  targetUserId: string,
): Promise<void> {
  const { error } = await supabase.rpc("group_remove_member", {
    p_conversation_id: conversationId,
    p_target_user_id: targetUserId,
  });
  if (error) throw error;
}

/** Primary device id per user (first active device). */
export async function fetchPrimaryDeviceIdsForUsers(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  const out = new Map<string, string>();
  await Promise.all(
    unique.map(async (uid) => {
      const { data, error } = await supabase
        .from("devices")
        .select("id")
        .eq("user_id", uid)
        .is("revoked_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data?.id) out.set(uid, data.id as string);
    }),
  );
  return out;
}

export async function fetchActiveMemberUserIds(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .is("left_at", null);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id as string);
}

export async function fetchGroupEpochsDescending(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<GroupEpochRow[]> {
  const { data, error } = await supabase
    .from("group_session_epochs")
    .select("id, conversation_id, epoch, created_by_device_id, created_by_user_id")
    .eq("conversation_id", conversationId)
    .order("epoch", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GroupEpochRow[];
}

export async function fetchWrapForRecipient(
  supabase: SupabaseClient,
  epochId: string,
  recipientDeviceId: string,
): Promise<GroupKeyWrapRow | null> {
  const { data, error } = await supabase
    .from("group_key_wraps")
    .select("epoch_id, recipient_device_id, author_device_id, ciphertext, nonce, algorithm, associated_data")
    .eq("epoch_id", epochId)
    .eq("recipient_device_id", recipientDeviceId)
    .maybeSingle();
  if (error) throw error;
  return (data as GroupKeyWrapRow | null) ?? null;
}

export async function unwrapGroupKeyFromWrap(
  supabase: SupabaseClient,
  cipher: SessionCipher,
  recipientDeviceId: string,
  epoch: GroupEpochRow,
  wrap: GroupKeyWrapRow,
): Promise<Uint8Array> {
  const authorJson = await fetchPublicBundleJsonForDevice(supabase, wrap.author_device_id);
  if (!authorJson) throw new Error("Missing author bundle for wrap.");
  const authorParsed = parsePublicKeyBundleJson(authorJson);

  const ad = wrap.associated_data ?? {};
  const meta: MessageAssociatedData = {
    conversationId: epoch.conversation_id,
    senderDeviceId: wrap.author_device_id,
    recipientDeviceId,
    timestampMs: Number(ad.timestamp_ms) || 0,
  };

  const plain = await cipher.decryptUtf8(
    { ciphertextB64: wrap.ciphertext, nonceB64: wrap.nonce },
    authorParsed,
    meta,
  );
  return decodeGroupKeyWrapPayload(plain);
}

/**
 * Creates the next epoch row + pairwise wraps for each primary device in memberUserIds.
 * Runs as the admin device publishing rotation after membership changes.
 */
export async function publishGroupEpochKey(opts: {
  supabase: SupabaseClient;
  cipher: SessionCipher;
  conversationId: string;
  adminUserId: string;
  adminDeviceId: string;
  /** Active member user IDs (including admins). */
  memberUserIds: string[];
}): Promise<{ epoch: number; epochRowId: string }> {
  const existing = await fetchGroupEpochsDescending(opts.supabase, opts.conversationId);
  const nextEpoch = existing.length === 0 ? 1 : Math.max(...existing.map((e) => e.epoch)) + 1;

  const { data: insertedEpoch, error: eErr } = await opts.supabase
    .from("group_session_epochs")
    .insert({
      conversation_id: opts.conversationId,
      epoch: nextEpoch,
      created_by_user_id: opts.adminUserId,
      created_by_device_id: opts.adminDeviceId,
    })
    .select("id")
    .single();
  if (eErr) throw eErr;
  const epochRowId = insertedEpoch!.id as string;

  const groupKey = await generateGroupSymmetricKey();
  const wrapPayload = encodeGroupKeyWrapPayload(groupKey);

  const devices = await fetchPrimaryDeviceIdsForUsers(opts.supabase, opts.memberUserIds);

  let idx = 0;
  for (const [, targetDeviceId] of devices) {
    const bundleJson = await fetchPublicBundleJsonForDevice(opts.supabase, targetDeviceId);
    if (!bundleJson) continue;
    const recipient = parsePublicKeyBundleJson(bundleJson);
    const ts = Date.now() + idx;
    idx += 1;
    const meta: MessageAssociatedData = {
      conversationId: opts.conversationId,
      senderDeviceId: opts.adminDeviceId,
      recipientDeviceId: targetDeviceId,
      timestampMs: ts,
    };
    const encrypted = await opts.cipher.encryptUtf8(wrapPayload, recipient, meta);
    const { error: wErr } = await opts.supabase.from("group_key_wraps").insert({
      epoch_id: epochRowId,
      recipient_device_id: targetDeviceId,
      author_device_id: opts.adminDeviceId,
      ciphertext: encrypted.ciphertextB64,
      nonce: encrypted.nonceB64,
      algorithm: "ciphersafe.aead.xchacha.v2",
      associated_data: {
        timestamp_ms: meta.timestampMs,
        conversation_id: opts.conversationId,
        sender_device_id: opts.adminDeviceId,
        recipient_device_id: targetDeviceId,
      },
    });
    if (wErr) throw wErr;
  }

  return { epoch: nextEpoch, epochRowId };
}

/** Compare wraps on latest epoch vs expected primary-device count (best-effort MVP check). */
export async function countWrapsForEpoch(supabase: SupabaseClient, epochId: string): Promise<number> {
  const { count, error } = await supabase
    .from("group_key_wraps")
    .select("*", { count: "exact", head: true })
    .eq("epoch_id", epochId);
  if (error) throw error;
  return count ?? 0;
}

export async function verifyLatestEpochWrapCoverage(opts: {
  supabase: SupabaseClient;
  conversationId: string;
  expectedDeviceCount: number;
}): Promise<{ ok: boolean; latestEpoch: number | null; wrapCount: number }> {
  const epochs = await fetchGroupEpochsDescending(opts.supabase, opts.conversationId);
  if (epochs.length === 0) return { ok: false, latestEpoch: null, wrapCount: 0 };
  const latest = epochs[epochs.length - 1]!;
  const wrapCount = await countWrapsForEpoch(opts.supabase, latest.id);
  return { ok: wrapCount >= opts.expectedDeviceCount, latestEpoch: latest.epoch, wrapCount };
}

/** Fetch conversation shell for routing crypto/UI. */
export async function fetchConversationShell(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{ type: "direct" | "group"; title: string | null } | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("type, title")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { type: data.type as "direct" | "group", title: (data.title as string | null) ?? null };
}

export async function fetchMyMembership(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<{ role: "admin" | "member" } | null> {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data?.role) return null;
  const r = data.role as string;
  if (r !== "admin" && r !== "member") return null;
  return { role: r };
}

/** Primary bundle for opening DM verification — reused when verifying group peers. */
export { fetchPrimaryPeerPublicBundle };

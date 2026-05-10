import type { SupabaseClient } from "@supabase/supabase-js";

import type { PublicKeyBundleRecord } from "@/lib/crypto/types";
import { CRYPTO_PROTOCOL_VERSION } from "@/lib/crypto/types";
import { publicBundleRecordToJson } from "@/lib/crypto/session";

export type InboxConversation =
  | {
      kind: "direct";
      conversationId: string;
      peerUserId: string;
      peerUsername: string;
      peerDisplayName: string;
    }
  | {
      kind: "group";
      conversationId: string;
      title: string;
      memberCount: number;
      myRole: "admin" | "member";
    };

/** @deprecated Prefer InboxConversation — kept for older call sites. */
export type ConversationSummary = Extract<InboxConversation, { kind: "direct" }>;

type DeviceKeyRow = {
  id: string;
  identity_public_key: string;
  identity_signing_public_key: string;
  signed_prekey_key_id: string;
  signed_prekey_public: string;
  signed_prekey_signature: string;
  one_time_prekeys: Array<{ key_id: string; public_key: string; consumed_at: string | null }> | null;
};

function bundleRecordFromDeviceRow(device: DeviceKeyRow): PublicKeyBundleRecord {
  const otps = (device.one_time_prekeys ?? []).filter((r) => !r.consumed_at);
  return {
    v: CRYPTO_PROTOCOL_VERSION,
    identityDhPublicKeyB64: device.identity_public_key,
    identitySigningPublicKeyB64: device.identity_signing_public_key,
    signedPreKey: {
      id: device.signed_prekey_key_id,
      publicKeyB64: device.signed_prekey_public,
      signatureB64: device.signed_prekey_signature,
    },
    oneTimePreKeys: otps.map((r) => ({ id: r.key_id, publicKeyB64: r.public_key })),
  };
}

export async function listInboxConversations(
  supabase: SupabaseClient,
  userId: string,
): Promise<InboxConversation[]> {
  const { data: mine, error: mineErr } = await supabase
    .from("conversation_members")
    .select(
      `
      conversation_id,
      role,
      conversations!inner ( type, title )
    `,
    )
    .eq("user_id", userId)
    .is("left_at", null);

  if (mineErr) throw mineErr;
  const rows = mine ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.conversation_id as string);

  const { data: members, error: memErr } = await supabase
    .from("conversation_members")
    .select("conversation_id, user_id")
    .in("conversation_id", ids)
    .is("left_at", null);

  if (memErr) throw memErr;

  const countByConversation = new Map<string, number>();
  const directPeerByConversation = new Map<string, string>();

  for (const row of members ?? []) {
    const cid = row.conversation_id as string;
    countByConversation.set(cid, (countByConversation.get(cid) ?? 0) + 1);
  }

  const convTypeById = new Map<string, string>();
  for (const r of rows) {
    const cid = r.conversation_id as string;
    const c = r.conversations as { type?: string; title?: string | null } | null;
    convTypeById.set(cid, String(c?.type ?? "direct"));
  }

  for (const row of members ?? []) {
    const cid = row.conversation_id as string;
    if (convTypeById.get(cid) !== "direct") continue;
    const uid = row.user_id as string;
    if (uid === userId) continue;
    directPeerByConversation.set(cid, uid);
  }

  const peerIds = [...new Set(directPeerByConversation.values())];
  let profileMap = new Map<string, { username: string; display_name: string }>();
  if (peerIds.length > 0) {
    const { data: profiles, error: profErr } = await supabase.from("profiles").select("id, username, display_name").in("id", peerIds);
    if (profErr) throw profErr;
    profileMap = new Map(
      (profiles ?? []).map((p) => [
        p.id as string,
        { username: p.username as string, display_name: (p.display_name as string) ?? "" },
      ]),
    );
  }

  return rows.map((r): InboxConversation | null => {
    const cid = r.conversation_id as string;
    const conv = r.conversations as { type?: string; title?: string | null };
    const ctype = String(conv?.type ?? "direct");
    const roleRaw = r.role as string;
    const myRole: "admin" | "member" = roleRaw === "admin" ? "admin" : "member";

    if (ctype === "group") {
      const title = (conv.title as string | null)?.trim() || "Group";
      return {
        kind: "group",
        conversationId: cid,
        title,
        memberCount: countByConversation.get(cid) ?? 0,
        myRole,
      };
    }

    const peerId = directPeerByConversation.get(cid);
    if (!peerId) return null;
    const prof = profileMap.get(peerId);
    if (!prof) return null;
    return {
      kind: "direct",
      conversationId: cid,
      peerUserId: peerId,
      peerUsername: prof.username,
      peerDisplayName: prof.display_name || prof.username,
    };
  }).filter(Boolean) as InboxConversation[];
}

/** Direct-message inbox rows only (group chats omitted). */
export async function listConversationSummaries(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConversationSummary[]> {
  const all = await listInboxConversations(supabase, userId);
  return all.filter((c): c is ConversationSummary => c.kind === "direct");
}

export async function createDirectConversationRpc(
  supabase: SupabaseClient,
  peerUserId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_direct_conversation", {
    peer_user_id: peerUserId,
  });
  if (error) throw error;
  return data as string;
}

export async function searchProfilesRpc(
  supabase: SupabaseClient,
  prefix: string,
): Promise<Array<{ id: string; username: string; display_name: string }>> {
  const { data, error } = await supabase.rpc("search_profiles", {
    search_prefix: prefix,
    max_results: 12,
  });
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; username: string; display_name: string }>;
}

/** Primary device for peer user + wire-format JSON bundle for crypto (`PublicKeyBundleRecord`). */
export async function fetchPrimaryPeerPublicBundle(
  supabase: SupabaseClient,
  peerUserId: string,
): Promise<{ deviceId: string; bundleJson: string } | null> {
  const { data, error } = await supabase
    .from("devices")
    .select(
      `
      id,
      identity_public_key,
      identity_signing_public_key,
      signed_prekey_key_id,
      signed_prekey_public,
      signed_prekey_signature,
      one_time_prekeys ( key_id, public_key, consumed_at )
    `,
    )
    .eq("user_id", peerUserId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as DeviceKeyRow;
  const record = bundleRecordFromDeviceRow(row);
  return {
    deviceId: row.id,
    bundleJson: publicBundleRecordToJson(record),
  };
}

export async function fetchPublicBundleJsonForDevice(
  supabase: SupabaseClient,
  deviceId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("devices")
    .select(
      `
      id,
      identity_public_key,
      identity_signing_public_key,
      signed_prekey_key_id,
      signed_prekey_public,
      signed_prekey_signature,
      one_time_prekeys ( key_id, public_key, consumed_at )
    `,
    )
    .eq("id", deviceId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as DeviceKeyRow;
  const record = bundleRecordFromDeviceRow(row);
  return publicBundleRecordToJson(record);
}

export async function fetchPeerUserIdForDirectConversation(
  supabase: SupabaseClient,
  conversationId: string,
  myUserId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .is("left_at", null);

  if (error) throw error;
  const peer = (data ?? []).find((row) => (row.user_id as string) !== myUserId);
  return (peer?.user_id as string | undefined) ?? null;
}

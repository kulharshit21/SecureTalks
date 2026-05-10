/**
 * Guided or partial-automated smoke test for two real users.
 * Does NOT seed fake chats/messages. Full E2EE send requires browser device keys — see guided steps.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const A_EMAIL = process.env.TEST_USER_A_EMAIL?.trim();
const A_PASS = process.env.TEST_USER_A_PASSWORD?.trim();
const B_EMAIL = process.env.TEST_USER_B_EMAIL?.trim();
const B_PASS = process.env.TEST_USER_B_PASSWORD?.trim();

const VERIFY_CONV = process.env.SMOKE_CONVERSATION_ID?.trim();
const VERIFY_ONLY = process.env.SMOKE_VERIFY_LAST_MESSAGE === "1";

function printGuidedChecklist() {
  console.log(`
=== Two-user smoke test (guided) ===

Complete with two browsers/profiles and real accounts:

1. Create / sign in User A.
2. Finish onboarding and device key generation.
3. Create / sign in User B (separate profile/browser).
4. Finish onboarding and device key generation for User B.
5. User A: search User B by username.
6. User A: add contact / start direct chat (requires B's device bundle registered).
7. User A: open direct chat and send an encrypted text message.
8. In Dashboard or SQL: confirm public.messages rows store ciphertext + nonce only (no plaintext column).
9. User B: confirm message appears and decrypts locally.
10. User B: reply; check delivery/read paths as implemented.
11. Send an encrypted attachment; verify Storage path:
    encrypted-attachments/{conversation_id}/{message_id}/{attachment_id}.bin
12. Send a disappearing message; after expiry, confirm soft-delete / cleanup behavior.
13. Exercise safety number / QR if applicable.
14. AI: use rewrite on draft only after explicit consent.
15. Open /security (security dashboard) and run Edge audit.
16. Confirm marketing copy matches reality (no fake security scores).

Automated assistance (optional env):
  TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD, TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD
  → creates session, checks profiles/devices, calls create_direct_conversation.

After sending at least one message in the UI:
  SMOKE_CONVERSATION_ID=<uuid> SMOKE_VERIFY_LAST_MESSAGE=1 npm run smoke:two-user-chat
  → verifies latest message row has ciphertext / nonce and no unexpected plaintext fields.

No fake data is inserted beyond RPC calls you explicitly automate.
`);
}

async function assertProfilesAndDevices(supabase: SupabaseClient, userId: string, label: string) {
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile) {
    console.warn(`${label}: no profile row for ${userId}`);
  } else {
    console.log(`${label}: profile ok — username=${profile.username}`);
  }

  const { data: devices, error: dErr } = await supabase
    .from("devices")
    .select("id")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (dErr) throw dErr;
  if (!devices?.length) {
    console.warn(`${label}: no active devices — complete device setup in browser before E2EE send.`);
  } else {
    console.log(`${label}: active device count=${devices.length}`);
  }
}

async function verifyLastMessage(supabase: SupabaseClient, conversationId: string) {
  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, ciphertext, nonce, algorithm, associated_data, sender_id, sender_device_id")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  const row = rows?.[0];
  if (!row) {
    console.warn("No messages in conversation — send one from the UI first.");
    return;
  }

  const forbiddenKeys = ["plaintext", "body_text", "content", "text_body", "plaintext_preview"];
  const raw = JSON.stringify(row).toLowerCase();
  for (const k of forbiddenKeys) {
    if (raw.includes(`"${k}"`)) {
      console.error(`FAIL: unexpected key-like token in row payload: ${k}`);
      process.exitCode = 1;
      return;
    }
  }

  if (!row.ciphertext || !row.nonce) {
    console.error("FAIL: message row missing ciphertext or nonce.");
    process.exitCode = 1;
    return;
  }

  const readable = /^[a-z0-9\s.,!?'"()-]{30,}$/i.test(row.ciphertext);
  if (readable) {
    console.warn(
      "WARN: ciphertext looks like readable ASCII — verify this is not accidental plaintext storage.",
    );
  }

  console.log(
    `OK: latest message ${row.id} has ciphertext length=${row.ciphertext.length}, nonce set, algorithm=${row.algorithm}`,
  );
}

async function automatedFlow() {
  if (!URL || !ANON) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    process.exit(1);
    return;
  }

  if (!A_EMAIL || !A_PASS || !B_EMAIL || !B_PASS) {
    printGuidedChecklist();
    process.exit(0);
    return;
  }

  const clientA = createClient(URL, ANON);
  const { data: aAuth, error: aErr } = await clientA.auth.signInWithPassword({
    email: A_EMAIL,
    password: A_PASS,
  });
  if (aErr || !aAuth.user) {
    console.error("User A sign-in failed:", aErr?.message ?? "unknown");
    process.exit(1);
    return;
  }
  const userA = aAuth.user.id;
  console.log("User A signed in:", userA);

  await assertProfilesAndDevices(clientA, userA, "A");

  await clientA.auth.signOut();

  const clientB = createClient(URL, ANON);
  const { data: bAuth, error: bErr } = await clientB.auth.signInWithPassword({
    email: B_EMAIL,
    password: B_PASS,
  });
  if (bErr || !bAuth.user) {
    console.error("User B sign-in failed:", bErr?.message ?? "unknown");
    process.exit(1);
    return;
  }
  const userB = bAuth.user.id;
  console.log("User B signed in:", userB);

  await assertProfilesAndDevices(clientB, userB, "B");

  await clientB.auth.signOut();

  const clientA2 = createClient(URL, ANON);
  const { data: a2, error: a2Err } = await clientA2.auth.signInWithPassword({
    email: A_EMAIL,
    password: A_PASS,
  });
  if (a2Err || !a2.session) {
    console.error("User A re-sign-in failed:", a2Err?.message);
    process.exit(1);
    return;
  }

  const { data: convId, error: rpcErr } = await clientA2.rpc("create_direct_conversation", {
    peer_user_id: userB,
  });

  if (rpcErr) {
    console.error("create_direct_conversation failed:", rpcErr.message);
    process.exit(1);
    return;
  }

  console.log("OK: direct conversation id:", convId);
  console.log(
    "\nNext: open this chat in the app (both users), send encrypted messages from the UI.",
    "\nEncryption uses SessionCipher in the browser — not reproducible in this CLI alone.",
    `\nThen verify DB row: SMOKE_CONVERSATION_ID=${convId} SMOKE_VERIFY_LAST_MESSAGE=1 npm run smoke:two-user-chat`,
  );
}

async function main() {
  if (VERIFY_ONLY && !VERIFY_CONV) {
    console.error("Set SMOKE_CONVERSATION_ID when using SMOKE_VERIFY_LAST_MESSAGE=1.");
    process.exit(1);
    return;
  }

  if (!URL || !ANON) {
    printGuidedChecklist();
    console.error("(Also set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY for automated mode.)");
    process.exit(0);
    return;
  }

  if (VERIFY_ONLY && VERIFY_CONV) {
    const client = createClient(URL, ANON);
    const email = A_EMAIL;
    const pass = A_PASS;
    if (!email || !pass) {
      console.error("SMOKE_VERIFY_LAST_MESSAGE requires TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD for session.");
      process.exit(1);
      return;
    }
    const { data, error } = await client.auth.signInWithPassword({ email, password: pass });
    if (error || !data.session) {
      console.error("Sign-in failed:", error?.message);
      process.exit(1);
      return;
    }
    await verifyLastMessage(client, VERIFY_CONV);
    return;
  }

  await automatedFlow();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Verifies deployed Edge Functions respond safely (no auth leaks, safe errors).
 * Loads optional `.env.local` from cwd for NEXT_PUBLIC_* and secrets used only here.
 */

import { createClient } from "@supabase/supabase-js";
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const CLEANUP_SECRET = process.env.CLEANUP_EXPIRED_SECRET?.trim() ?? "";

/** Treat response as leaking if it looks like a long secret / JWT body. */
function assertNoSecretLeak(label: string, text: string, status: number) {
  const patterns: RegExp[] = [
    /sk-[a-zA-Z0-9]{16,}/,
    /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
    /MISTRAL_API_KEY/i,
    /SUPABASE_SERVICE_ROLE_KEY/i,
    /srv\.role/i,
  ];
  for (const re of patterns) {
    if (re.test(text)) {
      console.error(`FAIL: ${label} response may leak secrets (status ${status}).`);
      process.exitCode = 1;
      return;
    }
  }
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  let failed = false;

  if (!SUPABASE_URL || !ANON_KEY) {
    console.log(
      "SKIP: Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (e.g. via .env.local).",
    );
    process.exit(0);
    return;
  }

  const fnBase = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1`;

  // 1) security-audit — no user JWT → 401
  {
    const url = `${fnBase}/security-audit`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: "{}",
    });
    const text = await res.text();
    assertNoSecretLeak("security-audit unauthenticated", text, res.status);
    if (res.status !== 401) {
      console.error(`FAIL: security-audit expected 401 without session, got ${res.status}`);
      failed = true;
    } else {
      console.log("OK: security-audit returns 401 without auth.");
    }
  }

  // 2) mistral — unknown action (needs auth; otherwise 401 is still safe)
  const email =
    process.env.TEST_USER_EMAIL?.trim() ||
    process.env.TEST_USER_A_EMAIL?.trim() ||
    "";
  const password =
    process.env.TEST_USER_PASSWORD?.trim() ||
    process.env.TEST_USER_A_PASSWORD?.trim() ||
    "";

  let accessToken: string | null = null;
  if (email && password) {
    const supabase = createClient(SUPABASE_URL, ANON_KEY);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session?.access_token) {
      console.log(
        "SKIP authenticated mistral checks: sign-in failed (verify TEST_USER_* credentials).",
      );
    } else {
      accessToken = data.session.access_token;
    }
  } else {
    console.log(
      "SKIP: mistral signed-in checks — set TEST_USER_EMAIL / TEST_USER_PASSWORD (or TEST_USER_A_*).",
    );
  }

  const mistralHeaders = {
    apikey: ANON_KEY,
    Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${ANON_KEY}`,
  };

  // Unauthenticated: expect 401
  if (!accessToken) {
    const r = await postJson(`${fnBase}/mistral-ai-assist`, mistralHeaders, {
      action: "rewrite_draft",
      payload: "hello",
      explicitConsent: true,
    });
    assertNoSecretLeak("mistral-ai-assist unauthenticated", r.text, r.status);
    if (r.status !== 401) {
      console.error(`FAIL: mistral-ai-assist expected 401 without user session, got ${r.status}`);
      failed = true;
    } else {
      console.log("OK: mistral-ai-assist returns 401 without user session.");
    }
  }

  if (accessToken) {
    const authHeaders = {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    };

    const unknownAction = await postJson(`${fnBase}/mistral-ai-assist`, authHeaders, {
      action: "not_a_real_action",
      payload: "hello",
      explicitConsent: true,
    });
    assertNoSecretLeak("mistral unknown action", unknownAction.text, unknownAction.status);
    if (unknownAction.status !== 400) {
      console.error(`FAIL: unknown action expected 400, got ${unknownAction.status}`);
      failed = true;
    } else {
      console.log("OK: mistral-ai-assist rejects unknown action.");
    }

    const noConsent = await postJson(`${fnBase}/mistral-ai-assist`, authHeaders, {
      action: "rewrite_draft",
      payload: "hello",
    });
    assertNoSecretLeak("mistral missing consent", noConsent.text, noConsent.status);
    if (noConsent.status !== 400) {
      console.error(`FAIL: missing explicitConsent expected 400, got ${noConsent.status}`);
      failed = true;
    } else {
      console.log("OK: mistral-ai-assist rejects missing explicitConsent.");
    }
  }

  // 5) cleanup — missing secret → 403
  {
    const url = `${fnBase}/cleanup-expired-messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const text = await res.text();
    assertNoSecretLeak("cleanup-expired-messages forbidden", text, res.status);
    if (res.status !== 403) {
      console.error(`FAIL: cleanup expected 403 without x-cleanup-secret/user, got ${res.status}`);
      failed = true;
    } else {
      console.log("OK: cleanup-expired-messages rejects missing cron secret.");
    }
  }

  // Optional: correct secret calls RPC (may soft-delete rows)
  if (CLEANUP_SECRET) {
    const url = `${fnBase}/cleanup-expired-messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        "Content-Type": "application/json",
        "x-cleanup-secret": CLEANUP_SECRET,
      },
      body: "{}",
    });
    const text = await res.text();
    assertNoSecretLeak("cleanup-expired-messages with secret", text, res.status);
    if (res.status !== 200) {
      console.log(
        `NOTE: cleanup with CLEANUP_EXPIRED_SECRET returned ${res.status} (check Edge logs if unexpected).`,
      );
    } else {
      console.log("OK: cleanup-expired-messages accepts x-cleanup-secret.");
    }
  } else {
    console.log("SKIP: optional cleanup secret round-trip — set CLEANUP_EXPIRED_SECRET to verify 200.");
  }

  if (failed) {
    process.exit(1);
  }
  console.log("\nEdge health check completed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

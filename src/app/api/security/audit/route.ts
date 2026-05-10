import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function devFallbackEnabled(): boolean {
  return process.env.AI_PROXY_USE_NEXT_ROUTE === "true";
}

/**
 * Authenticated JSON audit surface for the /security dashboard (dev fallback).
 * Production uses `security-audit` Edge Function via `functions.invoke`.
 */
export async function GET() {
  if (!devFallbackEnabled()) {
    return NextResponse.json(
      {
        error:
          "Next audit route disabled. Use security-audit Edge Function from the client, or set AI_PROXY_USE_NEXT_ROUTE=true for local dev.",
      },
      { status: 410 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: snapshot, error } = await supabase.rpc("security_audit_snapshot");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const root = process.cwd();
  const aiRoute = path.join(root, "src/app/api/ai/mistral/route.ts");
  let aiAudit = { routeExists: false, mentionsNoPromptLogging: false, usesConsoleLogNearCompletion: false };
  if (existsSync(aiRoute)) {
    const src = readFileSync(aiRoute, "utf8");
    aiAudit = {
      routeExists: true,
      mentionsNoPromptLogging: /Do not log prompts/i.test(src),
      usesConsoleLogNearCompletion: /console\.(log|debug|info|warn)\(.*(completion|choice|message)/i.test(src),
    };
  }

  const cryptoTests = {
    coreCryptoTestExists: existsSync(path.join(root, "src/lib/crypto/crypto.test.ts")),
    groupCryptoTestExists: existsSync(path.join(root, "src/lib/crypto/group-crypto.test.ts")),
    noAiOnSendGuardExists: existsSync(path.join(root, "src/lib/ai/no-ai-on-send-path.test.ts")),
  };

  const publicEnvKeys = Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC_"));

  const { count: active_devices_for_user } = await supabase
    .from("devices")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("revoked_at", null);

  let encrypted_attachments_bucket: { id: string; public: boolean } | null = null;
  try {
    const admin = createSupabaseAdminClient();
    const { data: b } = await admin.schema("storage").from("buckets").select("id, public").eq("id", "encrypted-attachments").maybeSingle();
    if (b?.id) encrypted_attachments_bucket = { id: b.id, public: Boolean(b.public) };
  } catch {
    /* service role missing — omit bucket probe */
  }

  return NextResponse.json({
    snapshot,
    aiAudit,
    cryptoTests,
    publicEnvKeysCount: publicEnvKeys.length,
    publicEnvKeysSample: publicEnvKeys.slice(0, 12),
    mistralSecretConfigured: Boolean(process.env.MISTRAL_API_KEY?.trim()),
    deployment_surface: "next_dev_fallback",
    active_devices_for_user: active_devices_for_user ?? 0,
    encrypted_attachments_bucket,
  });
}

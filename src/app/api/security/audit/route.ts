import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Authenticated JSON audit surface for the /security dashboard.
 * Does not return secret values — only booleans, counts, and metadata.
 */
export async function GET() {
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

  return NextResponse.json({
    snapshot,
    aiAudit,
    cryptoTests,
    publicEnvKeysCount: publicEnvKeys.length,
    publicEnvKeysSample: publicEnvKeys.slice(0, 12),
    mistralSecretConfigured: Boolean(process.env.MISTRAL_API_KEY?.trim()),
  });
}

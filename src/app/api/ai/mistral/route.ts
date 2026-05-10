import { NextResponse } from "next/server";

import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { systemPromptForPurpose } from "@/lib/ai/mistral-prompts";
import { validateMistralProxyBody } from "@/lib/ai/validate-request";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function parseRateEnv(): { windowMs: number; maxInWindow: number } {
  const windowMs = Number(process.env.AI_RATE_LIMIT_WINDOW_MS ?? 900_000);
  const maxInWindow = Number(process.env.AI_RATE_LIMIT_MAX ?? 30);
  return {
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 900_000,
    maxInWindow: Number.isFinite(maxInWindow) && maxInWindow > 0 ? maxInWindow : 30,
  };
}

export async function POST(req: Request) {
  /**
   * Invariants (golden rule — see SECURITY_CLAIMS.md):
   * - Never persist user payloads or completions to Postgres, logs, or Redis from this handler.
   * - Payload exists only in memory for the upstream Mistral request (and whatever Mistral retains under their policy).
   */
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "AI features are not configured on this deployment." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { windowMs, maxInWindow } = parseRateEnv();
  const limitedKey = `mistral_ai:${user.id}`;
  if (!checkAiRateLimit({ key: limitedKey, windowMs, maxInWindow })) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
  }

  let jsonBody: unknown;
  try {
    jsonBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validated = validateMistralProxyBody(jsonBody);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { purpose, payload } = validated.body;
  const model = process.env.MISTRAL_CHAT_MODEL?.trim() || "mistral-large-latest";
  const system = systemPromptForPurpose(purpose);

  /** Do not log prompts or completions — avoids accidental PII in server logs. */
  const upstream = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: payload },
      ],
      temperature: 0.3,
    }),
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: "Upstream AI request failed." }, { status: 502 });
  }

  let completion: unknown;
  try {
    completion = await upstream.json();
  } catch {
    return NextResponse.json({ error: "Invalid upstream response." }, { status: 502 });
  }

  const choice = (completion as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0];
  const text = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";

  if (!text) {
    return NextResponse.json({ error: "Empty completion." }, { status: 502 });
  }

  return NextResponse.json({ text });
}

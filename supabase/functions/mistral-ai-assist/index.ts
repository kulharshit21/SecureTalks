import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_MAX_PAYLOAD_CHARS = 24_000;
const ALLOWED_ACTIONS = ["rewrite_draft", "summarize_selected", "analyze_reported"] as const;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function systemPrompt(action: string, variant?: string): string {
  switch (action) {
    case "rewrite_draft":
      return [
        "You rewrite user drafts for clarity and tone.",
        "Preserve intent. Do not add facts or names the user did not write.",
        "Output only the rewritten message text, no preamble.",
      ].join(" ");
    case "summarize_selected":
      if (variant === "reply_suggestion") {
        return [
          "The user pasted an excerpt of peer messages they can already see locally.",
          "Suggest exactly one short reply they could send (max ~2 sentences).",
          "Neutral-friendly tone unless context obviously needs otherwise.",
          "Output only the suggested reply text — no quotes, labels, or preamble.",
        ].join(" ");
      }
      return [
        "You summarize an excerpt the user explicitly selected or exported from their chat.",
        "Use short bullets. Do not infer missing context.",
        "No preamble.",
      ].join(" ");
    case "analyze_reported":
      return [
        "You help triage a single reported message for abuse/harassment.",
        "Respond with: (1) severity low/medium/high/unclear, (2) one-line rationale, (3) suggested action for a human moderator.",
        "Do not repeat slurs verbatim if avoidable; describe categories instead.",
      ].join(" ");
    default:
      return "";
  }
}

function validateBody(raw: unknown): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid JSON body." };
  const o = raw as Record<string, unknown>;
  const action = o.action;
  const payload = o.payload;
  const explicitConsent = o.explicitConsent;
  const variant = o.variant;

  if (typeof action !== "string" || !ALLOWED_ACTIONS.includes(action as (typeof ALLOWED_ACTIONS)[number])) {
    return { ok: false, error: "Unknown or missing action." };
  }
  if (explicitConsent !== true) return { ok: false, error: "explicitConsent must be true." };
  if (typeof payload !== "string") return { ok: false, error: "Payload must be a string." };
  if (payload.length === 0) return { ok: false, error: "Payload is empty." };
  if (payload.length > AI_MAX_PAYLOAD_CHARS) return { ok: false, error: "Payload too large." };

  if (variant !== undefined) {
    if (action !== "summarize_selected") return { ok: false, error: "variant is only allowed for summarize_selected." };
    if (variant !== "summary" && variant !== "reply_suggestion") return { ok: false, error: "Invalid summarize variant." };
  }

  return { ok: true, body: o };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) return json({ error: "Supabase env missing." }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user?.id) return json({ error: "Unauthorized" }, 401);

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const validated = validateBody(parsed);
  if (!validated.ok) return json({ error: validated.error }, 400);

  const action = validated.body.action as string;
  const payload = validated.body.payload as string;
  const variant = validated.body.variant as string | undefined;

  const apiKey = Deno.env.get("MISTRAL_API_KEY")?.trim();
  if (!apiKey) return json({ error: "AI features are not configured on this deployment." }, 503);

  const model = Deno.env.get("MISTRAL_CHAT_MODEL")?.trim() || "mistral-large-latest";
  const system = systemPrompt(action, variant);

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

  if (!upstream.ok) return json({ error: "Upstream AI request failed." }, 502);

  let completion: unknown;
  try {
    completion = await upstream.json();
  } catch {
    return json({ error: "Invalid upstream response." }, 502);
  }

  const choice = (completion as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0];
  const text = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";

  if (!text) return json({ error: "Empty completion." }, 502);

  return json({ text, action });
});

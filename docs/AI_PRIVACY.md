# AI features & privacy (Mistral)

**Privyra / SecureTalks** exposes **optional** Mistral features through **Supabase Edge Functions** (`mistral-ai-assist`). These paths are **never** wired into normal send/receive/decrypt flows.

## Hard rule

**Private conversation traffic must never be sent to Mistral automatically.**

Forbidden hooks: realtime inserts, decrypt loops, Send button, attachment pipeline, receipt polling, middleware.

## Allowed actions (explicit click + consent)

All requests require JSON `explicitConsent: true`.

| UI | Edge `action` | Notes |
| -- | ------------- | ----- |
| Rewrite draft | `rewrite_draft` | Current textarea only |
| Summarize export | `summarize_selected` + `variant: "summary"` | User-edited excerpt |
| Report analysis | `analyze_reported` | Single snippet user confirms |
| Suggest reply | `summarize_selected` + `variant: "reply_suggestion"` | Peer lines already visible locally (bounded window) |

## Transport

- **Production:** `supabase.functions.invoke("mistral-ai-assist", { body })` — JWT forwarded by Supabase client.
- **Local fallback:** Next route `/api/ai/mistral` only when `AI_PROXY_USE_NEXT_ROUTE=true` **and** optional `NEXT_PUBLIC_AI_USE_NEXT_FALLBACK=true` on the browser build.

## Server / Edge behaviour

- Edge verifies authenticated user (anonymous rejected).
- **No logging** of prompts, completions, or message bodies in application code.
- **No DB persistence** of AI payloads in this app.
- **`MISTRAL_API_KEY`** lives in Edge secrets (or dev-only Next env for fallback) — never `NEXT_PUBLIC_*`.

## Threat notes

Mistral is a **third party**. Scoped excerpts leave the browser **only** after deliberate user action.

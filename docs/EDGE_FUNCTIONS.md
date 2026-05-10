# Supabase Edge Functions

Deployed functions live under `supabase/functions/*/`.

| Function | Role |
| -------- | ---- |
| `mistral-ai-assist` | Authenticated Mistral proxy — actions `rewrite_draft`, `summarize_selected`, `analyze_reported`; requires `explicitConsent: true`; never logs prompts/bodies. |
| `security-audit` | Authenticated JSON audit — calls `security_audit_snapshot`, counts active devices, verifies `encrypted-attachments` bucket metadata. |
| `cleanup-expired-messages` | Calls `public.cleanup_expired_messages()` via **service role** after caller passes **cron secret** (`x-cleanup-secret`) **or** valid user JWT. |

## Deploy

```bash
npx supabase functions deploy mistral-ai-assist security-audit cleanup-expired-messages --project-ref YOUR_PROJECT_REF
```

Set secrets in Supabase dashboard (**Edge Functions → Secrets**): `MISTRAL_API_KEY`, optional `MISTRAL_CHAT_MODEL`, `CLEANUP_EXPIRED_SECRET`.

## Client wiring

Browser uses `supabase.functions.invoke(...)` with the user session JWT. Next.js API routes (`/api/ai/mistral`, `/api/security/audit`) stay **disabled unless** `AI_PROXY_USE_NEXT_ROUTE=true` (local dev escape hatch).

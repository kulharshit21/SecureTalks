# Security audit checklist

Combine **automated posture** (Edge Function + SQL RPC) with **manual RLS probes**.

## A — Edge + RPC (every deploy)

1. `/security` page loads via `security-audit` Edge Function (`functions.invoke`) — expect `deployment_surface: supabase_edge`.
2. `security_audit_snapshot` RPC returns `messages_suspicious_plaintext_named_columns === 0`.
3. RLS flags in snapshot are `true` for `messages`, `conversations`, `conversation_members`, `attachments`, `devices`.
4. Storage bucket `encrypted-attachments` exists and **`public === false`** (Edge reads `storage.buckets` with service role after JWT check).

## B — Manual JWT matrix

Follow detailed steps in [`SECURITY_RLS_CHECKLIST.md`](./SECURITY_RLS_CHECKLIST.md) (two users, membership-negative tests, ciphertext visibility).

## C — Secrets

- `MISTRAL_API_KEY` only on Edge secrets / server env — never `NEXT_PUBLIC_*`.
- `SUPABASE_SERVICE_ROLE_KEY` never imported from client bundles (`server-only` admin helper).

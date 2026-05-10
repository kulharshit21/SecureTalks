# Agent instructions — SecureTalks

## Golden rule

**Do not create fake security.**

1. If a feature is **not** encrypted client-side against the server on the same footing as core messaging, label it **incomplete** or **out-of-band** in UI and docs.
2. **Never** introduce persistence of: plaintext private messages, private keys, raw attachment bytes, or AI prompts/completions from chats (Mistral proxy is forward-only; no DB/logging of bodies).
3. Prefer **correctness + tests** over flashy UI or marketing claims.

When adding crypto paths, extend Vitest coverage (crypto modules, `no-ai-on-send-path`, `ai-proxy-invariants`, attachment upload tests).

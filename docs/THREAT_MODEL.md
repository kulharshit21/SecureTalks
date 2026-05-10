# Threat model (Phase&nbsp;1)

## Assets

- **A1 — Message confidentiality**: plaintext of 1:1 chats.
- **A2 — Sender integrity/authentication (weak in MVP)**: box mode gives pairwise authenticity but not transcript hashing or deniability.
- **A3 — Device private keys**: libsodium secret keys + wrapping PIN.
- **A4 — Availability**: conversation delivery metadata.

## Actors

| Actor | Capability | MVP notes |
| ----- | ---------- | --------- |
| Honest-but-curious Supabase operator | Read Postgres/Storage, tamper with rows absent client detection | Cannot derive plaintext without breaking crypto + stealing keys |
| Network attacker | TLS downgrade attempts, MITM outside TLS trust | Browser relies on HTTPS + Supabase certificate ecosystem |
| Malicious participant | Send malformed ciphertext | Client must handle decrypt failures gracefully |
| Malware on device | Full memory/DOM access | Out of scope — defeats any browser-only E2EE |

## Attack scenarios

1. **Database dump** — Attacker obtains `messages.ciphertext`. Without device PIN + wrapped secret, plaintext stays opaque (assuming libsodium soundness). Metadata still leaks.
2. **JWT theft** — Bearer token replay lets attacker invoke Supabase as user until expiry/revocation; cannot decrypt historic ciphertext without vault PIN + wrapped key material on a compromised device.
3. **Realtime spoofing** — Broadcast typing events are unsigned; treat as UX hints only.
4. **Profile impersonation** — Mitigated by username uniqueness + authenticated updates; does not affect ciphertext authenticity guarantees beyond social engineering.

## Residual risks & roadmap hooks

- Upgrade to **Signal Protocol / MLS** for PCS/FS.
- Add signed **security events** correlation IDs for tamper-evident auditing (still ciphertext-only payloads).

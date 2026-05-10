# Security model

This document states **what CipherSafe Phase&nbsp;1 protects, what it does not, and where honesty matters.**

## Guarantees (relative to the MVP design)

1. **Server-side storage** — Supabase tables hold ciphertext and cryptographic metadata (`ciphertext`, `nonce`) rather than user-visible message bodies.
2. **Client-side secrets** — Private keys exist only as AES‑GCM‑wrapped blobs in IndexedDB (unlocked with a **device PIN** that never leaves the browser).
3. **Transport posture** — Messages never traverse bespoke Next.js API routes; plaintext is not logged by server components included in this repo (there are no server endpoints accepting bodies).
4. **Authorization** — Postgres Row Level Security ties reads/writes to authenticated identities and conversation membership.

## Explicit non-guarantees (Phase&nbsp;1 honesty list)

1. **No Signal-grade forward secrecy** — Static `crypto_box` keys mean past ciphertext could be decrypted if long-term secret keys leak later.
2. **No post-quantum hardness** — libsodium’s classical curves only.
3. **Metadata leakage** — Servers still observe timestamps, membership, typing channels, presence heartbeats, attachment sizes, IP/TLS metadata, etc.
4. **Device compromise** — Malware on the endpoint can exfiltrate PINs, memory, or decrypted transcripts regardless of database encryption.
5. **Authentication UX caveats** — Supabase Auth emails/links are outside the E2EE boundary until the session is established.

## MVP cryptography labeling

Public-facing copy should describe Phase&nbsp;1 crypto as **“educational / prototype”** unless/until an independent audit covers the full messaging protocol.

## Rotation & evolution path

The façade in `src/lib/crypto/types.ts` is the stable seam:

- Replace `SodiumBoxCipher` with double ratchet / MLS sessions.
- Persist protocol-specific state client-side (still never upload private material).

See `THREAT_MODEL.md` for adversary assumptions.

---

## Operational threat scenarios (high level)

| Scenario | Impact inside MVP scope | Notes |
| -------- | ------------------------ | ----- |
| **Malicious Supabase operator / buggy SQL migration** | Can reorder, delay, drop ciphertext; attempt privilege escalation via SECURITY DEFINER RPCs; cannot derive plaintext without breaking cryptography assumptions | Reduce blast radius with branching previews, migration reviews, least-privilege CI secrets. |
| **Stolen Postgres snapshot** | Reveals ciphertext, structured metadata (membership graphs, timestamps, attachment envelope blobs); plaintext stays unavailable unless keys guessed | Rotate leaked JWT/signing keys; assume ciphertext archival persists offline. |
| **Compromised user laptop/browser** | Malware can read decrypted transcripts after PIN unlock; capture keystrokes; scrape IndexedDB | Out-of-band device revocation UX remains roadmap debt (`devices.revoked_at` starts posture only). |
| **Revoked or stale device** | Old ciphertext might remain decryptable for epochs wrapped before revocation unless rotations purge visibility client-side | Group MVP rotates symmetric epochs administratively — partial hygiene until MLS/device transcripts shrink automatically. |
| **Malicious group member** | Can screenshot plaintext once decrypted on-device; can spam ciphertext or withhold rotations | Cryptographic removal requires MLS-grade PCS semantics — MVP warns admins to rotate after removals but former insiders retain historic ciphertext locally. |
| **Screenshots / screen recording / cloud backups** | Human-factor leakage orthogonal to transport crypto | Copy warns persist throughout CipherSafe UI. |
| **Push / desktop notifications** | OS surfaces snippets supplied by browser/OS integrations outside ciphertext envelope today | Disable previews server/client-wide until payloads omit sensitive previews entirely (tracked backlog). |

## MLS roadmap

CipherSafe group chats intentionally ship as **symmetric epoch keys wrapped pairwise** to demonstrate UX hooks without claiming Messaging Layer Security compliance.

**Roadmap milestones**

1. **Canonical handshake transcript logging** — pin MLS CipherSuites + credential formats ahead of implementation spikes.
2. **Rust/Core MLS adoption spike** — integrate audited MLS crate behind existing ciphertext envelopes (`messages.algorithm` already distinguishes payloads).
3. **Delivery-service secrecy upgrades** — ensure MLS epochs propagate without leaking epoch graphs via plaintext analytics columns (still zero plaintext columns guarantee).
4. **Interop testing harness** — automated vectors vs reference MLS implementations prior to marketing “production-grade groups.”

Until those milestones ship, documentation and UI must describe group crypto as **prototype / small-group MVP**.

See also `docs/GROUP_E2EE_MVP.md`.

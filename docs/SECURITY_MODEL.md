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

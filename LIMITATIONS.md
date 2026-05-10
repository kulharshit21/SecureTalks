# Limitations (read before shipping or comparing to WhatsApp/Signal)

## Cryptography & protocol

- **Phase 1 DH + AEAD** is **not** the Signal Protocol double ratchet. Long-lived keys imply **weaker forward secrecy** than Signal/WhatsApp-class deployments.
- **Group chats** use shared symmetric epochs and pairwise key wraps — an MVP “sender-key style” pattern. **Large-group E2EE** in production should target **MLS** or another formally analyzed design (`docs/GROUP_E2EE_MVP.md`, MLS roadmap in `docs/SECURITY_MODEL.md`).
- **Group file attachments** are **not implemented**: there is no client-side encrypt-and-upload path for groups yet — only **direct** chats support encrypted attachments.
- **Authentication binding** is limited to pairwise envelopes and UX verification — no transcript consensus or deniability guarantees.

## Trust & metadata

- **Supabase operator** (or anyone with DB + JWT minting power) sees ciphertext, membership graphs, timestamps, attachment metadata, and storage paths.
- **Realtime channels** (typing, presence) are integrity-light UX signals — treat as hints, not cryptographic proofs.

## Client & human factors

- **PIN unlock** exposes decrypted sessions to **browser extensions**, **malware**, and **physical access**.
- **Screenshots, screen recording, backups**, and **clipboard** bypass cryptography entirely.
- **Push / OS notifications** may leak snippets depending on OS settings (not modeled as confidential in MVP).

## AI features

- **Opt-in Mistral** routes send user-chosen text to `api.mistral.ai` via your server when the user triggers AI actions. This is **optional** and **off** without `MISTRAL_API_KEY`. Normal send/decrypt does not call Mistral (`docs/AI_PRIVACY.md`, tests).

## Operations

- **Expiry purge** (`purge_expired_messages`) requires a scheduler using **`service_role`** or equivalent — keep that key off browsers and CI logs.
- **Scaling AI rate limits** are in-memory per Node instance — use Redis or edge limits for multi-region production.

## Comparison hygiene

Do **not** publicly claim this build is “more secure than WhatsApp” **unless** you complete an independent security audit and narrow the comparison to specific, tested properties.

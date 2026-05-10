# LinkedIn post draft (edit voice to yours)

**Option A — technical**

I shipped **CipherSafe / SecureTalks**, a privacy-first **end-to-end encrypted web messenger prototype** built with Next.js, libsodium (X25519 + XChaCha20-Poly1305), and Supabase.

It keeps **plaintext in the browser**, stores **ciphertext-only** message rows, supports **encrypted attachments**, **disappearing timers**, **identity verification**, and **optional** Mistral-powered helpers that only run when the user explicitly opts in — normal messaging never hits the AI API.

Honest boundaries: this is a **research prototype**, not a audited WhatsApp competitor. Group chat uses a small-group symmetric epoch design — production large groups should move to **MLS**. Metadata still leaks to the operator; screenshots and malware still win.

Repo + docs: limitations and threat model included on purpose.

**Option B — short**

Privacy-first E2EE web messenger prototype — server sees ciphertext, not your messages. Encrypted attachments, TTL, verification UX, opt-in AI only. Built to learn and iterate, not to claim “more secure than WhatsApp” without an audit.

🔗 GitHub: https://github.com/kulharshit21/SecureTalks

---

*Replace the URL if you fork; avoid comparative security hype.*

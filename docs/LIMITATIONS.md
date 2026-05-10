# Limitations (summary)

Full narrative: root **`LIMITATIONS.md`**.

Highlights:

- **Not** independently audited — no proven superiority vs WhatsApp/Signal.
- **Group E2EE** is an MVP (epoch keys + wraps), not MLS — needs deeper review before large groups.
- **Screenshots, malware, compromised devices** defeat confidentiality regardless of ciphertext-at-rest.
- **Metadata** (membership, sizes, timing) visible to operator — minimization is partial only.
- **Opt-in AI** sends **only user-selected excerpts** to Mistral through Edge Functions — normal send/decrypt never calls AI.

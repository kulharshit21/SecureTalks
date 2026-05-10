<!-- ═══════════════════════════════════════════════════════════════════════════
     SecureTalks · Maintainer: https://github.com/kulharshit21  ·  Solo project
     ═══════════════════════════════════════════════════════════════════════════ -->

<div align="center">

# 🔐 SecureTalks

**Private by design · encrypted before it leaves your device**

[![Typing SVG](https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=22&duration=2800&pause=700&color=22C55E&center=true&vCenter=true&width=780&lines=Signal-inspired+DH+%2B+AEAD+envelope;Ciphertext-only+rows+in+Postgres;Libsodium+X25519+%2B+XChaCha20-Poly1305;Encrypted+attachments+%B7+disappearing+TTL)](https://github.com/kulharshit21/SecureTalks)

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%7C%20DB%20%7C%20Storage-3ecf8e?logo=supabase&logoColor=white)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Libsodium](https://img.shields.io/badge/crypto-libsodium-0969da)](https://libsodium.gitbook.io/)

<br/>

<sub><strong>Solo maintainer · research & architecture ·</strong> <a href="https://github.com/kulharshit21">@kulharshit21</a></sub>

</div>

---

## Snapshot

SecureTalks is a **premium-feel**, **privacy-forward web messenger**: plaintext stays inside an unlocked browser session; **Supabase** stores **only ciphertext**, structured AEAD metadata, and **encrypted blobs** in Storage. **Attachments** use an independent file key wrapped per-recipient. **Disappearing messages** set `expires_at`, hide rows via **RLS**, and ship with a **purge function** for scheduled cleanup.

> ⚠️ Disappearing timers reduce persistence—they **cannot stop screenshots**, malware on-device capture, or a compromised endpoint.

---

## Suggested GitHub metadata

Paste these under **About → Topics**:

```
end-to-end-encryption e2ee nextjs react typescript supabase libsodium privacy
x25519 xchacha20poly1305 encrypted-storage disappearing-messages realtime
```

**Short description (About → Description):**

> E2EE web messenger — libsodium session cipher, ciphertext-only Supabase, encrypted attachments, disappearing TTL — Next.js 16 & React 19.

---

## Architecture (animated mentally ✨ diagrams render live on GitHub)

```mermaid
flowchart TB
  subgraph Browser["🔒 Trust boundary — your tab"]
    direction TB
    UI["Next.js App Router UI<br/>shadcn · Tailwind"]
    Vault["Device gate · PIN unlock<br/>private keys in IndexedDB (idb)"]
    Cipher["SessionCipher<br/>X25519 triple DH · XChaCha AEAD envelope"]
    FileAEAD["File symmetric AEAD<br/>random file key · nonce ‖ ciphertext"]
    UI --> Vault
    Vault --> Cipher
    Cipher --> FileAEAD
  end

  subgraph Edge["Supabase — hostile infra assumed"]
    direction TB
    Auth["GoTrue Auth"]
    PG["Postgres + RLS<br/>messages · members · attachments meta"]
    ST["Private bucket<br/>attachments (ciphertext only)"]
    RT["Realtime<br/>typing · inserts"]
  end

  Browser -->|"JWT"| Auth
  Cipher -->|"insert ciphertext row"| PG
  FileAEAD -->|"XHR upload ciphertext"| ST
  PG <-->|"membership-scoped SELECT"| Browser
  ST <-->|"policy via attachments row"| Browser
  PG --> RT
```

---

## Encrypt path (high level)

```mermaid
sequenceDiagram
  participant U as User
  participant C as Client crypto
  participant DB as Postgres messages
  participant S as Storage bucket

  U->>C: Plaintext / file bytes
  C->>C: derive outbound DH secrets<br/>wrap UTF8 manifest OR body in AEAD
  C->>DB: ciphertext + nonce + algorithm<br/>associated_data JSON (devices + conversation + ts)
  opt Attachment
    C->>C: random fileKey · AEAD(file)<br/>wrap fileKey with SessionCipher
    C->>S: POST ciphertext blob only
    C->>DB: attachments row (wrapped key + path + mime hint)
  end
```

---

## Threat model (honest)

| Surface | What the server sees | What it never sees |
|--------|----------------------|---------------------|
| `messages` | Ciphertext, nonce, protocol id, bound metadata JSON | Plaintext bodies |
| `attachments` | Storage path, wrapped **file key** blob (still ciphertext to infra without device secrets), MIME hint | Plain files |
| Client compromise | N/A — attacker reads decrypted UX same as user | — |

This is **not** a substitute for a full audited Signal deployment—it centralizes transport/metadata via Supabase. Read **`docs/SECURITY_RLS_CHECKLIST.md`** after migrating.

---

## Stack

| Layer | Choices |
|-------|---------|
| App | Next.js 16 · React 19 · Tailwind 4 · shadcn/ui patterns · lucide-react |
| Auth | Supabase Auth (+ SSR `@supabase/ssr`) |
| Crypto | libsodium-wrappers · session envelope + separate file AEAD domain |
| Data | Postgres RLS · Storage policies · optional pg cron purge |

---

## Quick start

```bash
git clone https://github.com/kulharshit21/SecureTalks.git
cd SecureTalks
npm ci
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_* + redirect URLs
npm run dev
```

Apply SQL from `supabase/migrations/` via Supabase CLI or SQL editor (order matters).

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Next dev server |
| `npm run build` | Production build |
| `npm run test` | Vitest unit/crypto tests |
| `npm run test:e2e` | Playwright (configure env first) |
| `npm run lint` | ESLint |

---

## Scheduled expiry cleanup

After migrations, **`public.purge_expired_messages()`** deletes expired attachment objects then rows. Schedule with **Supabase pg_cron** or a trusted worker using **`service_role`** (already granted `EXECUTE` in migration).

---

## Maintainer

**Author & sole contributor:** [kulharshit21](https://github.com/kulharshit21)

---

<div align="center">

<sub>Built with intent · vibe-coded UI · research-backed crypto boundaries</sub>

</div>

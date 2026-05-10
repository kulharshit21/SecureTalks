# No mock policy (live UI)

- Production-facing routes must **not** import mock users, chats, messages, security scores, or audit JSON.
- **Empty states** + skeleton loaders are fine.
- Demo scripts belong under `docs/` or `scripts/dev-only` and must **never** auto-run in CI or app startup.
- Tests may use **local fixtures** inside `*.test.ts` files only — not bundled into client navigation paths.

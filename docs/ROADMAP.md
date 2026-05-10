# Roadmap

## Near term (Phase&nbsp;1.x)

- Wire **attachment pipeline**: encrypt blob client-side, upload ciphertext to Storage, persist `attachments` metadata row.
- Surface **presence state** in UI (channel plumbing exists already).
- Improve **typing attribution** (replace anonymous text with optional profile nicknames — still metadata).
- Harden **conversation de-duplication** (prevent duplicate direct chats between the same pair).

## Medium term (Phase&nbsp;2)

- Replace `SodiumBoxCipher` with **libsignal** or **MLS** behind `SessionCipher`.
- Add **multi-device** provisioning flows + signed pre-keys table columns already stubbed.
- Optional **hardware PIN / WebAuthn** wrapping for vault keys.

## Long term

- Desktop/Electron shell with OS keystore integration.
- Formal **third-party audit** + published verification guides.
- Federation/interop research (only after protocol stabilizes).

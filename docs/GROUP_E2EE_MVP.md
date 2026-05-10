# Group E2EE — MVP design notes

This mirrors what the web client implements today: **not MLS**, not audited at protocol scale.

## Summary

1. Each group conversation owns ordered **`group_session_epochs`** rows (`epoch` monotonic).
2. Every epoch introduces a fresh random **32-byte symmetric key** generated on an admin device.
3. That symmetric key is **pairwise-wrapped** (`group_key_wraps`) using the existing X25519 ratchet-style payload (`ciphersafe.aead.xchacha.v2`) toward each member’s **primary active device**.
4. Chat payloads use **`ciphersafe.group.aead.xchacha.v1`**: one AEAD ciphertext per message bound to `(conversation_id, sender_device_id, timestamp_ms, group_epoch)` AAD.
5. Server tables contain **only ciphertext** for message bodies and wraps.

## Membership changes

- Adding a member requires an admin to **rotate** so the newcomer receives a wrap for the latest epoch.
- Removing a member triggers UI prompts for admins to **rotate** — former members retain historic ciphertext locally (same limitation as pre-key-less pairwise designs).

## Comparison to production MLS

| Property | MVP symmetric epochs | MLS (target) |
| -------- | -------------------- | ------------ |
| Forward secrecy across epochs | Partial (post-rotation traffic uses new key; historic ciphertext still decryptable if old epoch leaked) | Strong PCS semantics with tree updates |
| Server-assisted equivocation resistance | Not modeled | Built into authenticated epoch negotiation |
| Large groups | Cost grows with wrap fan-out per epoch | Sub-linear ciphertext broadcast |

Ship messaging promises accordingly: **small trusted groups only** until MLS lands.

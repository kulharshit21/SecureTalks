/**
 * CipherSafe client crypto types (libsodium-backed).
 * Phase: X25519 DH + Ed25519 signatures + XChaCha20-Poly1305 AEAD with structured AAD.
 * Not a full audited Signal deployment — see SECURITY_MODEL.md.
 */

export const CRYPTO_PROTOCOL_VERSION = 2 as const;
export const CRYPTO_PROTOCOL_ID = "ciphersafe.aead.xchacha.v2";

/** 32-byte Curve25519 DH keypair (libsodium crypto_box / scalarmult base). */
export interface DhKeypair {
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array;
}

/** Ed25519 signing keypair (libsodium crypto_sign). */
export interface SigningKeypair {
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array;
}

/** Mutable pool secrets while device is unlocked (never logged). */
export interface UnlockedPrivateCrypto {
  identityDh: DhKeypair;
  identitySigning: SigningKeypair;
  signedPreKey: { id: string; secretKey: Uint8Array; publicKey: Uint8Array };
  /** Remaining one-time pre-key secrets keyed by id */
  oneTimePreKeys: Map<string, Uint8Array>;
}

/** Serializable public bundle for Supabase (`identity_public_key` JSON TEXT). */
export interface PublicKeyBundleRecord {
  v: typeof CRYPTO_PROTOCOL_VERSION;
  identityDhPublicKeyB64: string;
  identitySigningPublicKeyB64: string;
  signedPreKey: {
    id: string;
    publicKeyB64: string;
    signatureB64: string;
  };
  oneTimePreKeys: Array<{ id: string; publicKeyB64: string }>;
}

/** Parsed bundle for runtime crypto (no Base64). */
export interface ParsedPublicKeyBundle {
  identityDhPublicKey: Uint8Array;
  identitySigningPublicKey: Uint8Array;
  signedPreKeyPublicKey: Uint8Array;
  signedPreKeySignature: Uint8Array;
  signedPreKeyId: string;
  oneTimePreKeys: Array<{ id: string; publicKey: Uint8Array }>;
}

/** AEAD associated data — authenticated but not encrypted (sent alongside ciphertext). */
export interface MessageAssociatedData {
  conversationId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  timestampMs: number;
}

/** Wire payload stored in `messages` table (ephemeral DH pk concatenated before AEAD bytes inside ciphertext field). */
export interface EncryptedWirePayload {
  ciphertextB64: string;
  nonceB64: string;
}

export interface SessionCipher {
  readonly protocolId: string;
  encryptUtf8(
    plaintext: string,
    recipient: ParsedPublicKeyBundle,
    meta: MessageAssociatedData,
  ): Promise<EncryptedWirePayload>;
  decryptUtf8(payload: EncryptedWirePayload, sender: ParsedPublicKeyBundle, meta: MessageAssociatedData): Promise<string>;
}

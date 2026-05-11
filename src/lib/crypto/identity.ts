import { deserializePrivateCryptoBundle } from "./keys";
import { withSodium } from "./sodium";
import type { DhKeypair, SigningKeypair, UnlockedPrivateCrypto } from "./types";

export interface GeneratedIdentity {
  dh: DhKeypair;
  signing: SigningKeypair;
}

/**
 * Per-device long-term identity: X25519 (DH) + Ed25519 (signing pre-keys).
 */
export async function generateIdentityMaterial(): Promise<GeneratedIdentity> {
  return withSodium((sodium) => {
    const dh = sodium.crypto_box_keypair();
    const signing = sodium.crypto_sign_keypair();
    return {
      dh: {
        publicKey: dh.publicKey,
        secretKey: dh.privateKey,
      },
      signing: {
        publicKey: signing.publicKey,
        secretKey: signing.privateKey,
      },
    };
  });
}

/**
 * Rehydrate DH public key from secret (local consistency checks).
 */
export async function dhPublicKeyFromSecret(secretKey: Uint8Array): Promise<Uint8Array> {
  return withSodium((sodium) => sodium.crypto_scalarmult_base(secretKey));
}

/**
 * Rehydrate signing public key from libsodium's 64-byte crypto_sign secret key.
 *
 * Prefer `crypto_sign_ed25519_sk_to_pk` when the WASM build exposes it; otherwise use the
 * libsodium layout: secretKey = seed (32) || publicKey (32) — see libsodium crypto_sign docs.
 * libsodium-wrappers 0.8.x often omits sk_to_pk from the JS surface even though types list it.
 */
export async function signingPublicKeyFromSecret(secretKey: Uint8Array): Promise<Uint8Array> {
  return withSodium((sodium) => {
    const skToPk = sodium.crypto_sign_ed25519_sk_to_pk;
    if (typeof skToPk === "function") {
      return skToPk(secretKey);
    }
    const n = secretKey.length;
    const exp = sodium.crypto_sign_SECRETKEYBYTES;
    const pkLen = sodium.crypto_sign_PUBLICKEYBYTES;
    if (n !== exp) {
      throw new Error(`Ed25519 signing secret must be ${exp} bytes (got ${n}).`);
    }
    return secretKey.slice(pkLen, n);
  });
}

export async function unlockedPrivateCryptoFromVault(blob: Uint8Array): Promise<UnlockedPrivateCrypto> {
  const priv = deserializePrivateCryptoBundle(blob);
  const dhPk = await dhPublicKeyFromSecret(priv.identityDhSecret);
  const sigPk = await signingPublicKeyFromSecret(priv.identitySigningSecret);
  const spPk = await dhPublicKeyFromSecret(priv.signedPreKeySecret);
  return {
    identityDh: { secretKey: priv.identityDhSecret, publicKey: dhPk },
    identitySigning: { secretKey: priv.identitySigningSecret, publicKey: sigPk },
    signedPreKey: {
      id: priv.signedPreKeyId,
      secretKey: priv.signedPreKeySecret,
      publicKey: spPk,
    },
    oneTimePreKeys: priv.oneTimePreKeys,
  };
}

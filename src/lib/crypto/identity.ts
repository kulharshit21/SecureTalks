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
 * Rehydrate signing public key from secret.
 */
export async function signingPublicKeyFromSecret(secretKey: Uint8Array): Promise<Uint8Array> {
  return withSodium((sodium) => sodium.crypto_sign_ed25519_sk_to_pk(secretKey));
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

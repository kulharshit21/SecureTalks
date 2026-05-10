import type { SigningKeypair } from "./types";
import { withSodium } from "./sodium";

export interface SignedPreKeyMaterial {
  id: string;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  signature: Uint8Array;
}

function randomId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Medium-term signed DH pre-key (public half is signed with Ed25519 identity key).
 */
export async function generateSignedPreKey(identitySigning: SigningKeypair): Promise<SignedPreKeyMaterial> {
  return withSodium(async (sodium) => {
    const kp = sodium.crypto_box_keypair();
    const id = randomId();
    const sig = sodium.crypto_sign_detached(kp.publicKey, identitySigning.secretKey);
    return {
      id,
      publicKey: kp.publicKey,
      secretKey: kp.privateKey,
      signature: sig,
    };
  });
}

export interface OneTimePreKeyMaterial {
  id: string;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Batch-generate one-time DH pre-keys (consume private halves during inbound decryption).
 */
export async function generateOneTimePreKeys(count: number): Promise<OneTimePreKeyMaterial[]> {
  return withSodium(async (sodium) => {
    const out: OneTimePreKeyMaterial[] = [];
    for (let i = 0; i < count; i++) {
      const kp = sodium.crypto_box_keypair();
      out.push({
        id: randomId(),
        publicKey: kp.publicKey,
        secretKey: kp.privateKey,
      });
    }
    return out;
  });
}

export async function verifySignedPreKey(
  identitySigningPublicKey: Uint8Array,
  signedPreKeyPublicKey: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  return withSodium((sodium) => {
    try {
      return sodium.crypto_sign_verify_detached(signature, signedPreKeyPublicKey, identitySigningPublicKey);
    } catch {
      return false;
    }
  });
}
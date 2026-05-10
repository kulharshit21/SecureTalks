import { concatBytes } from "./keys";
import { withSodium } from "./sodium";

export function orderIdentityPublicKeys(a: Uint8Array, b: Uint8Array): [Uint8Array, Uint8Array] {
  if (a.length !== b.length) throw new Error("Identity key length mismatch.");
  for (let i = 0; i < a.length; i++) {
    const ba = a[i]!;
    const bb = b[i]!;
    if (ba < bb) return [a, b];
    if (ba > bb) return [b, a];
  }
  return [a, b];
}

export async function fingerprintRootBytes(identityDhPkA: Uint8Array, identityDhPkB: Uint8Array): Promise<Uint8Array> {
  return withSodium((sodium) => {
    const [low, high] = orderIdentityPublicKeys(identityDhPkA, identityDhPkB);
    return sodium.crypto_generichash(32, concatBytes(low, high), null);
  });
}

export async function formatSafetyNumber(
  identityDhPkA: Uint8Array,
  identityDhPkB: Uint8Array,
  digitCount = 60,
  groupSize = 5,
): Promise<string> {
  const root = await fingerprintRootBytes(identityDhPkA, identityDhPkB);
  let value = BigInt(0);
  for (const byte of root) {
    value = value * BigInt(256) + BigInt(byte);
  }
  const tenPow = BigInt(10) ** BigInt(digitCount);
  const digits = (value % tenPow).toString().padStart(digitCount, "0");
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += groupSize) {
    groups.push(digits.slice(i, i + groupSize));
  }
  return groups.join(" ");
}

/**
 * URL-safe Base64 (no padding) — QR-friendly and stable for the 32-byte fingerprint root.
 */
export function fingerprintQrString(fingerprintRoot32: Uint8Array): string {
  if (fingerprintRoot32.length !== 32) throw new Error("QR fingerprint expects 32-byte root.");
  return Buffer.from(fingerprintRoot32).toString("base64url");
}

export async function fingerprintQrPayloadUri(identityDhPkA: Uint8Array, identityDhPkB: Uint8Array): Promise<string> {
  const root = await fingerprintRootBytes(identityDhPkA, identityDhPkB);
  return `ciphersafe://fp/v2/${fingerprintQrString(root)}`;
}

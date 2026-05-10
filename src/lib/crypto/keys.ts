import { withSodium } from "./sodium";

export function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function randomBytes(length: number): Promise<Uint8Array> {
  return withSodium((sodium) => sodium.randombytes_buf(length));
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

const PRIVATE_BUNDLE_MAGIC = new Uint8Array([0x43, 0x53, 0x30, 0x32]); // "CS02"

function writeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function readUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Binary serialization of unlocked private material for PIN wrapping (IndexedDB vault blob).
 * Never log return value.
 */
export function serializePrivateCryptoBundle(material: {
  identityDhSecret: Uint8Array;
  identitySigningSecret: Uint8Array;
  signedPreKeyId: string;
  signedPreKeySecret: Uint8Array;
  oneTimePreKeys: Map<string, Uint8Array>;
}): Uint8Array {
  const parts: Uint8Array[] = [PRIVATE_BUNDLE_MAGIC];

  parts.push(material.identityDhSecret);
  parts.push(material.identitySigningSecret);

  const spId = writeUtf8(material.signedPreKeyId);
  const spLen = new Uint8Array(2);
  new DataView(spLen.buffer).setUint16(0, spId.length, false);
  parts.push(spLen, spId);
  parts.push(material.signedPreKeySecret);

  const otp = [...material.oneTimePreKeys.entries()];
  const otpCount = new Uint8Array(2);
  new DataView(otpCount.buffer).setUint16(0, otp.length, false);
  parts.push(otpCount);

  for (const [id, sk] of otp) {
    const idBytes = writeUtf8(id);
    const idLen = new Uint8Array(2);
    new DataView(idLen.buffer).setUint16(0, idBytes.length, false);
    parts.push(idLen, idBytes, sk);
  }

  return concatBytes(...parts);
}

export function deserializePrivateCryptoBundle(blob: Uint8Array): {
  identityDhSecret: Uint8Array;
  identitySigningSecret: Uint8Array;
  signedPreKeyId: string;
  signedPreKeySecret: Uint8Array;
  oneTimePreKeys: Map<string, Uint8Array>;
} {
  let o = 0;
  const expectMagic = blob.subarray(o, o + 4);
  o += 4;
  if (!constantTimeEqual(expectMagic, PRIVATE_BUNDLE_MAGIC)) {
    throw new Error("Unrecognized private bundle format.");
  }

  const identityDhSecret = cloneSlice(blob, o, 32);
  o += 32;
  const identitySigningSecret = cloneSlice(blob, o, 64);
  o += 64;

  const spIdLen = readU16(blob, o);
  o += 2;
  const signedPreKeyId = readUtf8(cloneSlice(blob, o, spIdLen));
  o += spIdLen;
  const signedPreKeySecret = cloneSlice(blob, o, 32);
  o += 32;

  const otpCount = readU16(blob, o);
  o += 2;
  const oneTimePreKeys = new Map<string, Uint8Array>();
  for (let i = 0; i < otpCount; i++) {
    const idLen = readU16(blob, o);
    o += 2;
    const id = readUtf8(cloneSlice(blob, o, idLen));
    o += idLen;
    const sk = cloneSlice(blob, o, 32);
    o += 32;
    oneTimePreKeys.set(id, sk);
  }

  if (o !== blob.length) {
    throw new Error("Private bundle trailing bytes.");
  }

  return {
    identityDhSecret,
    identitySigningSecret,
    signedPreKeyId,
    signedPreKeySecret,
    oneTimePreKeys,
  };
}

function readU16(buf: Uint8Array, offset: number): number {
  return new DataView(buf.buffer, buf.byteOffset + offset, 2).getUint16(0, false);
}

function cloneSlice(buf: Uint8Array, start: number, len: number): Uint8Array {
  const s = buf.subarray(start, start + len);
  const c = new Uint8Array(len);
  c.set(s);
  return c;
}

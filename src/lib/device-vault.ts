import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DB_NAME = "ciphersafe_vault_v1";

interface VaultSchema extends DBSchema {
  deviceSecrets: {
    key: string;
    value: VaultRecord;
  };
}

export interface VaultRecord {
  userId: string;
  deviceId: string;
  saltB64: string;
  ivB64: string;
  /** AES-GCM ciphertext of serialized private crypto bundle (never plaintext). */
  wrappedPrivateBundleB64: string;
  /** JSON public bundle for uploads / UX (no secrets). */
  publicBundleJson: string;
  protocolId: string;
}

async function openVaultDb(): Promise<IDBPDatabase<VaultSchema>> {
  return openDB<VaultSchema>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore("deviceSecrets", { keyPath: "userId" });
    },
  });
}

const enc = new TextEncoder();

async function deriveAesKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const saltBuf = new Uint8Array(salt);
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuf,
      iterations: 310_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toB64(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64");
}

function fromB64(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function asBufferSource(data: Uint8Array): BufferSource {
  return data as unknown as BufferSource;
}

export async function storeWrappedIdentity(args: {
  userId: string;
  pin: string;
  deviceId: string;
  privateBundlePlain: Uint8Array;
  publicBundleJson: string;
  protocolId: string;
}): Promise<void> {
  const salt = cloneBytes(crypto.getRandomValues(new Uint8Array(16)));
  const aesKey = await deriveAesKey(args.pin, salt);
  const iv = cloneBytes(crypto.getRandomValues(new Uint8Array(12)));
  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(iv) },
    aesKey,
    asBufferSource(cloneBytes(args.privateBundlePlain)),
  );

  const db = await openVaultDb();
  await db.put("deviceSecrets", {
    userId: args.userId,
    deviceId: args.deviceId,
    saltB64: toB64(salt),
    ivB64: toB64(iv),
    wrappedPrivateBundleB64: toB64(new Uint8Array(wrapped)),
    publicBundleJson: args.publicBundleJson,
    protocolId: args.protocolId,
  });
}

export async function loadWrappedRecord(userId: string): Promise<VaultRecord | undefined> {
  const db = await openVaultDb();
  return db.get("deviceSecrets", userId);
}

export async function unlockIdentity(args: {
  userId: string;
  pin: string;
}): Promise<{
  deviceId: string;
  protocolId: string;
  publicBundleJson: string;
  decryptedPrivateBundle: Uint8Array;
}> {
  const record = await loadWrappedRecord(args.userId);
  if (!record) {
    throw new Error("No device vault found for this account on this browser.");
  }

  const salt = cloneBytes(fromB64(record.saltB64));
  const iv = cloneBytes(fromB64(record.ivB64));
  const aesKey = await deriveAesKey(args.pin, salt);
  const wrapped = cloneBytes(fromB64(record.wrappedPrivateBundleB64));

  let secretBuf: ArrayBuffer;
  try {
    secretBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, aesKey, asBufferSource(wrapped));
  } catch {
    throw new Error("Incorrect device PIN.");
  }

  return {
    deviceId: record.deviceId,
    protocolId: record.protocolId,
    publicBundleJson: record.publicBundleJson,
    decryptedPrivateBundle: new Uint8Array(secretBuf),
  };
}

export async function deleteVaultRecord(userId: string): Promise<void> {
  const db = await openVaultDb();
  await db.delete("deviceSecrets", userId);
}

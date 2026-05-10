import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DB_NAME = "ciphersafe_crypto_secret_kv_v1";
const STORE = "secrets";

interface CryptoKvSchema extends DBSchema {
  secrets: {
    key: string;
    value: Uint8Array;
  };
}

class MemoryBackend {
  private readonly map = new Map<string, Uint8Array>();

  async put(key: string, value: Uint8Array): Promise<void> {
    const copy = new Uint8Array(value.length);
    copy.set(value);
    this.map.set(key, copy);
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const v = this.map.get(key);
    if (!v) return undefined;
    const copy = new Uint8Array(v.length);
    copy.set(v);
    return copy;
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async clearPrefix(prefix: string): Promise<void> {
    for (const k of [...this.map.keys()]) {
      if (k.startsWith(prefix)) this.map.delete(k);
    }
  }
}

let idbPromise: Promise<IDBPDatabase<CryptoKvSchema>> | null = null;

async function openKvDb(): Promise<IDBPDatabase<CryptoKvSchema>> {
  if (!idbPromise) {
    idbPromise = openDB<CryptoKvSchema>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE);
      },
    });
  }
  return idbPromise;
}

function shouldUseMemoryBackend(): boolean {
  return typeof indexedDB === "undefined";
}

const memory = new MemoryBackend();

export const cryptoSecretStorage = {
  async put(namespace: string, name: string, value: Uint8Array): Promise<void> {
    const key = `${namespace}:${name}`;
    if (shouldUseMemoryBackend()) {
      await memory.put(key, value);
      return;
    }
    const db = await openKvDb();
    await db.put(STORE, cloneBytes(value), key);
  },

  async get(namespace: string, name: string): Promise<Uint8Array | undefined> {
    const key = `${namespace}:${name}`;
    if (shouldUseMemoryBackend()) return memory.get(key);
    const db = await openKvDb();
    const v = await db.get(STORE, key);
    return v ? cloneBytes(v) : undefined;
  },

  async delete(namespace: string, name: string): Promise<void> {
    const key = `${namespace}:${name}`;
    if (shouldUseMemoryBackend()) {
      await memory.delete(key);
      return;
    }
    const db = await openKvDb();
    await db.delete(STORE, key);
  },

  async clearNamespace(namespace: string): Promise<void> {
    const prefix = `${namespace}:`;
    if (shouldUseMemoryBackend()) {
      await memory.clearPrefix(prefix);
      return;
    }
    const db = await openKvDb();
    const tx = db.transaction(STORE, "readwrite");
    const keys = await tx.store.getAllKeys();
    for (const k of keys) {
      if (typeof k === "string" && k.startsWith(prefix)) {
        await tx.store.delete(k);
      }
    }
    await tx.done;
  },
};

function cloneBytes(bytes: Uint8Array): Uint8Array {
  const c = new Uint8Array(bytes.length);
  c.set(bytes);
  return c;
}

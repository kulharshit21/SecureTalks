import type _sodiumType from "libsodium-wrappers";

export type Sodium = typeof _sodiumType;

let sodiumPromise: Promise<Sodium> | null = null;

/**
 * Ensures libsodium WASM is loaded. Every crypto entrypoint must await this first.
 */
export async function loadSodium(): Promise<Sodium> {
  if (!sodiumPromise) {
    sodiumPromise = import("libsodium-wrappers").then(async (mod) => {
      await mod.default.ready;
      return mod.default;
    });
  }
  return sodiumPromise;
}

/** Run `fn` after sodium.ready (single shared init). */
export async function withSodium<T>(fn: (sodium: Sodium) => T | Promise<T>): Promise<T> {
  const sodium = await loadSodium();
  return fn(sodium);
}

import { concatBytes } from "./keys";
import { withSodium } from "./sodium";

/** Domain separation for symmetric file blobs (distinct from message AEAD). */
const FILE_AAD = new TextEncoder().encode("CipherSafe|attachment-file|v1");

/**
 * Encrypt file plaintext with a random 32-byte key. Wire format: nonce || ciphertext+tag.
 */
export async function encryptAttachmentPlaintext(plaintext: Uint8Array): Promise<{ fileKey: Uint8Array; ciphertextBlob: Uint8Array }> {
  return withSodium((sodium) => {
    const fileKey = sodium.randombytes_buf(32);
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, FILE_AAD, null, nonce, fileKey);
    return { fileKey, ciphertextBlob: concatBytes(nonce, cipher) };
  });
}

/** Decrypt ciphertext produced by {@link encryptAttachmentPlaintext}. */
export async function decryptAttachmentPlaintext(ciphertextBlob: Uint8Array, fileKey: Uint8Array): Promise<Uint8Array> {
  return withSodium((sodium) => {
    const nonceLen = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
    if (ciphertextBlob.length <= nonceLen) throw new Error("Attachment ciphertext too short.");
    const nonce = ciphertextBlob.subarray(0, nonceLen);
    const raw = ciphertextBlob.subarray(nonceLen);
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, raw, FILE_AAD, nonce, fileKey);
  });
}

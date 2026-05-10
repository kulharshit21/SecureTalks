"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Upload ciphertext to Storage using XMLHttpRequest so upload progress is observable.
 * Mirrors Supabase JS FormData layout for POST /object/{bucket}/{path}.
 */
export async function uploadEncryptedAttachmentViaXhr(
  supabase: SupabaseClient,
  bucket: string,
  objectPath: string,
  ciphertextBlob: Blob,
  onProgress: (ratio01: number) => void,
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!baseUrl || !anonKey) throw new Error("Missing Supabase browser configuration.");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const cleanPath = objectPath.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
  const fullPath = `${bucket}/${cleanPath}`;
  const endpoint = `${baseUrl}/storage/v1/object/${fullPath}`;

  const fd = new FormData();
  fd.append("cacheControl", "3600");
  fd.append("", ciphertextBlob, "blob.bin");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        onProgress(Math.min(1, ev.loaded / ev.total));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
        return;
      }
      reject(new Error(`Storage upload failed (${xhr.status}): ${xhr.responseText || xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error("Storage upload network error."));
    xhr.send(fd);
  });
}

"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  const resolvedUrl = url.length > 0 ? url : "http://127.0.0.1:54321";
  const resolvedAnon = anon.length > 0 ? anon : "public-anon-key-placeholder";

  if ((!url || !anon) && process.env.NODE_ENV !== "production") {
    // Avoid crashing Next.js prerender/SSR when `.env.local` is not present yet.
    // Runtime chat features still require real Supabase credentials in the browser.
    console.warn("[CipherSafe] Supabase browser env missing — using placeholders for build/prerender.");
  }

  return createBrowserClient(resolvedUrl, resolvedAnon);
}

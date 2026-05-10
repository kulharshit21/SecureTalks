import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  const resolvedUrl = url.length > 0 ? url : "http://127.0.0.1:54321";
  const resolvedAnon = anon.length > 0 ? anon : "public-anon-key-placeholder";

  return createServerClient(resolvedUrl, resolvedAnon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* ignore when called outside Server Actions / Route Handler mutation contexts */
        }
      },
    },
  });
}

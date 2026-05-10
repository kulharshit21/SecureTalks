/**
 * Browser-safe env: only NEXT_PUBLIC_* keys.
 * Never import server secrets here.
 */

export type ClientPublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabasePublishableKey: string | undefined;
  appUrl: string | undefined;
};

export function getClientPublicEnv(): ClientPublicEnv {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || undefined,
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || undefined,
  };
}

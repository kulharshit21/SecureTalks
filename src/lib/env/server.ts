import "server-only";

export type ServerSecretsEnv = {
  supabaseServiceRoleKey: string | undefined;
  mistralApiKey: string | undefined;
};

/**
 * Server-only secrets. Never import from client components or `"use client"` modules.
 */
export function getServerSecretsEnv(): ServerSecretsEnv {
  return {
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
    mistralApiKey: process.env.MISTRAL_API_KEY?.trim() || undefined,
  };
}

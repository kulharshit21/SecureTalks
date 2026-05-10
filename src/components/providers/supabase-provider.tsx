"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const SupabaseContext = createContext<SupabaseClient | null>(null);

export function SupabaseProvider(props: { children: ReactNode }) {
  const [client] = useState(() => createBrowserSupabaseClient());
  const value = useMemo(() => client, [client]);
  return (
    <SupabaseContext.Provider value={value}>{props.children}</SupabaseContext.Provider>
  );
}

export function useSupabase(): SupabaseClient {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error("useSupabase must be used within SupabaseProvider");
  return ctx;
}

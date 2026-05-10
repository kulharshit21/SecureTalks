"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

import { SupabaseProvider } from "./supabase-provider";

export function AppProviders(props: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider>
        <SupabaseProvider>{props.children}</SupabaseProvider>
      </TooltipProvider>
    </NextThemesProvider>
  );
}

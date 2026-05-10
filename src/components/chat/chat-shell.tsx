"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, PanelLeft, Shield } from "lucide-react";

import { APP_NAME } from "@/lib/brand";

import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { DeviceGate } from "@/components/chat/device-gate";
import { PrivacyPanelSheet, PrivacyPanelTrigger } from "@/components/chat/privacy-panel-sheet";
import { PrivacySidePanel } from "@/components/chat/privacy-side-panel";
import { ThemeToggle } from "@/components/chat/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { useSupabase } from "@/components/providers/supabase-provider";
import { cn } from "@/lib/utils";

function PresenceBeacon(props: { userId: string }) {
  const supabase = useSupabase();

  useEffect(() => {
    const channel = supabase.channel("cipher-online", {
      config: { presence: { key: props.userId } },
    });

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({ online_at: Date.now() });
    });

    const heartbeat = window.setInterval(() => {
      void channel.track({ online_at: Date.now() });
    }, 25_000);

    return () => {
      window.clearInterval(heartbeat);
      void supabase.removeChannel(channel);
    };
  }, [props.userId, supabase]);

  return null;
}

export function ChatShell(props: { userId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMobileSidebarOpen(false));
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <DeviceGate userId={props.userId}>
      <PresenceBeacon userId={props.userId} />

      <div className="relative flex h-[100dvh] w-full overflow-hidden bg-background">
        {/* Mobile sidebar backdrop */}
        {mobileSidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 animate-in fade-in duration-200 md:hidden"
            style={{ background: "rgba(0,0,0,0.35)" }}
            aria-label="Close menu"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}

        {/* Single sidebar instance — slides in on small screens */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex h-full w-[min(100vw-3rem,308px)] shrink-0 flex-col border-r border-border/50 bg-sidebar/80 shadow-xl backdrop-blur-xl transition-transform duration-300 ease-out md:relative md:z-0 md:w-[308px] md:translate-x-0 md:shadow-none",
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <ChatSidebar userId={props.userId} onNavigate={() => setMobileSidebarOpen(false)} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur-xl md:px-5">
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30 text-foreground transition-colors hover:bg-muted/50"
                aria-label="Open conversations"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <PanelLeft className="size-5" aria-hidden />
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight">{APP_NAME}</p>
                <p className="truncate text-[11px] text-muted-foreground">Private · synced safely</p>
              </div>
            </div>

            <div className="hidden min-w-0 flex-1 md:block">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{APP_NAME}</p>
              <p className="truncate text-sm font-medium tracking-tight text-foreground">
                {pathname.startsWith("/chat/") && pathname.length > "/chat/".length ? "Conversation" : "Inbox"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/security"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden rounded-xl gap-2 sm:inline-flex")}
              >
                <Shield className="size-4" aria-hidden />
                Privacy check
              </Link>
              <PrivacyPanelTrigger
                className="xl:hidden"
                collapsed
                onClick={() => setPrivacyOpen(true)}
              />
              <ThemeToggle />
            </div>
          </header>

          <div className="min-h-0 flex-1">{props.children}</div>
        </div>

        <aside className="hidden h-full w-[min(100vw,320px)] shrink-0 border-l border-border/50 bg-sidebar/40 xl:flex">
          <PrivacySidePanel userId={props.userId} />
        </aside>

        <PrivacyPanelSheet userId={props.userId} open={privacyOpen} onOpenChange={setPrivacyOpen} />

        {/* Mobile bottom navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 grid h-14 grid-cols-3 border-t border-border/60 bg-background/90 backdrop-blur-xl md:hidden pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
              mobileSidebarOpen ? "text-primary" : "text-muted-foreground",
            )}
            onClick={() => setMobileSidebarOpen(true)}
          >
            <PanelLeft className="size-5" aria-hidden />
            Inbox
          </button>
          <Link
            href="/chat"
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
              pathname === "/chat" ? "text-primary" : "text-muted-foreground",
            )}
          >
            <MessageCircle className="size-5" aria-hidden />
            Home
          </Link>
          <button
            type="button"
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
              privacyOpen ? "text-primary" : "text-muted-foreground",
            )}
            onClick={() => setPrivacyOpen(true)}
          >
            <Shield className="size-5" aria-hidden />
            Security
          </button>
        </nav>
      </div>
    </DeviceGate>
  );
}

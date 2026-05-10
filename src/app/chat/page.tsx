"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Inbox, LayoutDashboard, Lock, MessageSquarePlus, Shield } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ChatHomePage() {
  return (
    <div className="relative flex h-full min-h-[min(70vh,560px)] flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_50%_-10%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_55%)]" />

      <div className="relative flex flex-1 flex-col justify-center px-5 py-12 md:px-10 md:py-16">
        <div className="mx-auto w-full max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/70 shadow-[0_24px_80px_-28px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.04] backdrop-blur-xl dark:bg-card/45 dark:shadow-[0_24px_80px_-28px_rgba(0,0,0,0.75)] dark:ring-white/[0.06]">
            <div className="absolute -right-16 -top-16 size-48 rounded-full bg-primary/15 blur-3xl" aria-hidden />
            <div className="absolute -bottom-12 -left-12 size-40 rounded-full bg-muted-foreground/10 blur-3xl" aria-hidden />

            <div className="relative space-y-8 px-8 py-10 md:px-10 md:py-12">
              <div className="flex justify-center">
                <div className="relative flex size-[4.5rem] items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                  <Inbox className="size-9 text-primary" strokeWidth={1.5} aria-hidden />
                  <span className="absolute -bottom-1 flex items-center gap-1 rounded-full border border-border/60 bg-background/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur-sm">
                    <LayoutDashboard className="size-3" aria-hidden />
                    Inbox
                  </span>
                </div>
              </div>

              <div className="space-y-3 text-center">
                <h1 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">Pick a conversation to open</h1>
                <p className="text-pretty text-sm leading-relaxed text-muted-foreground md:text-[15px]">
                  Your sidebar lists direct and group threads. On smaller screens, tap <strong className="font-medium text-foreground">Inbox</strong>{" "}
                  in the bar below to slide the list open.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SidebarHintCard icon={MessageSquarePlus} title="New chat" description="Use New conversation in the left sidebar." />
                <QuickCard icon={Shield} title="Security audit" description="RLS & crypto checks." href="/security" />
              </div>

              <div className="flex flex-col gap-3 border-t border-border/50 pt-8 sm:flex-row sm:justify-center">
                <Link
                  href="/"
                  className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-11 rounded-xl px-6")}
                >
                  <Lock className="mr-2 size-4 opacity-80" aria-hidden />
                  About CipherSafe
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarHintCard(props: { icon: LucideIcon; title: string; description: string }) {
  const Icon = props.icon;
  return (
    <div className="flex gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/5 p-4 text-left">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/25 ring-1 ring-border/50">
        <Icon className="size-[18px] text-muted-foreground" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight">{props.title}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{props.description}</p>
      </div>
    </div>
  );
}

function QuickCard(props: { icon: LucideIcon; title: string; description: string; href: string }) {
  const Icon = props.icon;
  return (
    <Link
      href={props.href}
      className={cn(
        "group flex gap-3 rounded-2xl border border-border/55 bg-muted/10 p-4 text-left transition-all hover:border-primary/30 hover:bg-muted/20 hover:shadow-md",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background/80 ring-1 ring-border/60 transition-colors group-hover:bg-primary/10 group-hover:ring-primary/20">
        <Icon className="size-[18px] text-foreground/90" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight">{props.title}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{props.description}</p>
      </div>
    </Link>
  );
}

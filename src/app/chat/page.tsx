"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { MessageCircle, Shield } from "lucide-react";

import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export default function ChatHomePage() {
  return (
    <div className="relative flex h-full min-h-[min(72vh,580px)] flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-5%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_55%)]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[min(50%,420px)] w-[min(100%,720px)] -translate-x-1/2 rounded-[100%] bg-primary/[0.06] blur-3xl" aria-hidden />

      <div className="relative flex flex-1 flex-col justify-center px-5 py-12 md:px-10 md:py-16">
        <div className="mx-auto w-full max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-10 text-center">
            <div className="space-y-4">
              <h1 className="text-balance font-semibold tracking-tight text-foreground text-[1.75rem] leading-[1.15] md:text-4xl md:leading-[1.1]">
                Your private inbox starts here.
              </h1>
              <p className="text-pretty text-base leading-relaxed text-muted-foreground md:text-lg md:leading-relaxed">
                Start a conversation. Messages are encrypted before they sync.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              <HeroActionCard
                icon={MessageCircle}
                title="Start a chat"
                description="Find a contact and send your first private message."
                hint="Use “New chat” in the sidebar (or tap Inbox on your phone)."
              />
              <HeroActionCard
                icon={Shield}
                title="Run privacy check"
                description="Confirm your device, storage, and recovery settings."
                href="/security"
              />
            </div>

            <p className="text-sm text-muted-foreground">
              <Link
                href="/"
                className="font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                How {APP_NAME} protects your chats
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroActionCard(props: {
  icon: LucideIcon;
  title: string;
  description: string;
  href?: string;
  hint?: string;
}) {
  const Icon = props.icon;
  const className = cn(
    "group flex flex-col gap-3 rounded-2xl border border-border/45 bg-card/50 p-6 text-left shadow-sm backdrop-blur-sm transition-all duration-200",
    "hover:border-primary/20 hover:bg-card/70 hover:shadow-md",
  );

  const inner = (
    <>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15 transition-colors group-hover:bg-primary/15">
        <Icon className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
      </div>
      <div>
        <p className="text-sm font-semibold tracking-tight text-foreground">{props.title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{props.description}</p>
        {props.hint ? (
          <p className="mt-3 text-xs font-medium text-primary">{props.hint}</p>
        ) : null}
      </div>
    </>
  );

  if (props.href) {
    return (
      <Link href={props.href} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}

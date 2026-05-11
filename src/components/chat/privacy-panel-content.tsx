"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronRight, HeartHandshake, Lock, Shield, Sparkles } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";

import { PRIVACY_OVERVIEW_COPY } from "@/components/chat/privacy-copy";

const OVERVIEW_ICONS: LucideIcon[] = [Lock, Shield, HeartHandshake, Sparkles];

export function PrivacyPanelContent() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="w-full space-y-4">
      <LayoutGroup>
        <motion.div
          layout
          className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/50 p-4 shadow-[0_8px_28px_-12px_rgb(0_0_0/0.45)] backdrop-blur-sm transition-[border-color,box-shadow] duration-300 hover:border-border/65 hover:shadow-[0_14px_40px_-14px_rgb(0_0_0/0.5)] dark:hover:shadow-[0_16px_48px_-12px_color-mix(in_oklab,var(--primary)_12%,transparent)]"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          {PRIVACY_OVERVIEW_COPY.cards.map((row, i) => (
            <OverviewRow
              key={row.title}
              icon={OVERVIEW_ICONS[i] ?? Lock}
              title={row.title}
              body={row.body}
              reduceMotion={reduceMotion}
            />
          ))}
        </motion.div>
      </LayoutGroup>

      <motion.p
        className="text-[12px] leading-relaxed text-muted-foreground"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={reduceMotion ? undefined : { opacity: 1 }}
        transition={{ delay: 0.12, duration: 0.35 }}
      >
        {PRIVACY_OVERVIEW_COPY.footer}
      </motion.p>

      <details className="group/details overflow-hidden rounded-xl border border-border/45 bg-muted/20 shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--foreground)_6%,transparent)] transition-[border-color,background-color,box-shadow] duration-200 open:border-primary/25 open:bg-muted/28 open:shadow-md">
        <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-2 px-4 py-3.5 text-sm font-medium text-foreground outline-none transition-colors marker:content-none hover:bg-muted/25 [&::-webkit-details-marker]:hidden">
          <span>Advanced details</span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out group-open/details:rotate-90"
            aria-hidden
          />
        </summary>
        <div className="border-t border-border/35 px-4 pb-4 pt-3">
          <p className="text-[13px] leading-[1.65] text-muted-foreground sm:text-sm sm:leading-[1.7]">
            The client uses libsodium (X25519 key agreement, XChaCha20-Poly1305) for message envelopes. Supabase stores ciphertext
            under Postgres Row Level Security (RLS); attachments live in a private bucket. Optional draft help calls a Mistral
            hosted API only after explicit consent, via Edge Functions — never for normal sends. Delivery fan-out uses encrypted
            rows and recipient metadata (e.g.{" "}
            <code className="rounded-md bg-muted/80 px-1.5 py-0.5 font-mono text-[11px] text-foreground/90">message_recipients</code>
            ). Device registration publishes public keys only.
          </p>
        </div>
      </details>
    </div>
  );
}

function OverviewRow(props: {
  icon: LucideIcon;
  title: string;
  body: string;
  reduceMotion: boolean | null;
}) {
  const Icon = props.icon;
  const hover = props.reduceMotion ? {} : { scale: 1.01, x: 2 };

  return (
    <motion.div
      layout
      className="group/row flex items-start gap-3 rounded-xl px-1 py-0.5 transition-colors duration-200 hover:bg-muted/25"
      whileHover={hover}
      transition={{ type: "spring", stiffness: 480, damping: 28 }}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15 transition-[background-color,box-shadow] duration-200 group-hover/row:bg-primary/[0.14] group-hover/row:shadow-[0_6px_16px_-6px_color-mix(in_oklab,var(--primary)_35%,transparent)]">
        <Icon className="size-4 text-primary" aria-hidden />
      </div>
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm font-medium leading-tight tracking-tight text-foreground">{props.title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{props.body}</p>
      </div>
    </motion.div>
  );
}

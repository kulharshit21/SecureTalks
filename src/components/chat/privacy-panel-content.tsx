"use client";

import type { LucideIcon } from "lucide-react";
import { HeartHandshake, Lock, Shield, Sparkles } from "lucide-react";

import { PRIVACY_OVERVIEW_COPY } from "@/components/chat/privacy-copy";
import { SecurityDashboard } from "@/components/chat/security-dashboard";
import { showPrivacyDiagnosticsPanel } from "@/lib/privacy-diagnostics-flag";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const OVERVIEW_ICONS: LucideIcon[] = [Lock, Shield, HeartHandshake, Sparkles];

export function PrivacyPanelContent(props: { userId: string }) {
  const diagnostics = showPrivacyDiagnosticsPanel();

  if (!diagnostics) {
    return <PrivacyOverviewOnly />;
  }

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/40 p-1">
        <TabsTrigger value="overview" className="rounded-lg text-xs font-medium">
          Overview
        </TabsTrigger>
        <TabsTrigger value="developer" className="rounded-lg text-xs font-medium">
          Diagnostics
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-5 space-y-4 animate-in fade-in duration-300">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/40 p-4">
          {PRIVACY_OVERVIEW_COPY.cards.map((row, i) => (
            <OverviewRow key={row.title} icon={OVERVIEW_ICONS[i] ?? Lock} title={row.title} body={row.body} />
          ))}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">{PRIVACY_OVERVIEW_COPY.footer}</p>

        <details className="group rounded-xl border border-border/40 bg-muted/15 px-4 py-3 text-sm">
          <summary className="cursor-pointer select-none font-medium text-foreground outline-none marker:text-muted-foreground [&::-webkit-details-marker]:hidden [&::before]:mr-2 [&::before]:inline-block [&::before]:text-muted-foreground group-open:[&::before]:content-['▼'] [&::before]:content-['▶']">
            Advanced details
          </summary>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            The client uses libsodium (X25519 key agreement, XChaCha20-Poly1305) for message envelopes. Supabase stores ciphertext
            under Postgres Row Level Security (RLS); attachments live in a private bucket. Optional draft help calls a Mistral
            hosted API only after explicit consent, via Edge Functions — never for normal sends. Delivery fan-out uses encrypted
            rows and recipient metadata (e.g. <code className="rounded bg-muted px-1 font-mono text-[10px]">message_recipients</code>
            ). Device registration publishes public keys only.
          </p>
        </details>
      </TabsContent>

      <TabsContent value="developer" className="mt-5 animate-in fade-in duration-300">
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Diagnostics are for developers and audits. Nothing here weakens encryption — it only surfaces technical status.
        </p>
        <SecurityDashboard userId={props.userId} />
      </TabsContent>
    </Tabs>
  );
}

function PrivacyOverviewOnly() {
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/40 p-4">
        {PRIVACY_OVERVIEW_COPY.cards.map((row, i) => (
          <OverviewRow key={row.title} icon={OVERVIEW_ICONS[i] ?? Lock} title={row.title} body={row.body} />
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">{PRIVACY_OVERVIEW_COPY.footer}</p>

      <details className="group rounded-xl border border-border/40 bg-muted/15 px-4 py-3 text-sm">
        <summary className="cursor-pointer select-none font-medium text-foreground outline-none marker:text-muted-foreground [&::-webkit-details-marker]:hidden [&::before]:mr-2 [&::before]:inline-block [&::before]:text-muted-foreground group-open:[&::before]:content-['▼'] [&::before]:content-['▶']">
          Advanced details
        </summary>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          The client uses libsodium (X25519 key agreement, XChaCha20-Poly1305) for message envelopes. Supabase stores ciphertext
          under Postgres Row Level Security (RLS); attachments live in a private bucket. Optional draft help calls a Mistral
          hosted API only after explicit consent, via Edge Functions — never for normal sends. Delivery fan-out uses encrypted
          rows and recipient metadata (e.g. <code className="rounded bg-muted px-1 font-mono text-[10px]">message_recipients</code>
          ). Device registration publishes public keys only.
        </p>
      </details>
    </div>
  );
}

function OverviewRow(props: { icon: LucideIcon; title: string; body: string }) {
  const Icon = props.icon;
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="size-4 text-primary" aria-hidden />
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium leading-none">{props.title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{props.body}</p>
      </div>
    </div>
  );
}

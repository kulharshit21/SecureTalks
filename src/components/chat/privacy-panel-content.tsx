"use client";

import { Database, Lock, Server, Sparkles } from "lucide-react";

import { SecurityDashboard } from "@/components/chat/security-dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function PrivacyPanelContent(props: { userId: string }) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-2 bg-muted/40">
        <TabsTrigger value="overview" className="text-xs font-medium">
          Overview
        </TabsTrigger>
        <TabsTrigger value="developer" className="text-xs font-medium">
          Diagnostics
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-5 space-y-4 animate-in fade-in duration-300">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Lock className="size-4 text-primary" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none">End-to-end encrypted</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Messages are encrypted on this device with libsodium (X25519 + XChaCha20-Poly1305). Plaintext is not written to
                Postgres.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <Server className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none">Server-blind storage</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                The sync layer sees ciphertext, routing metadata, and delivery timestamps — not message content.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Database className="size-4 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none">Keys stay on device</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Private key material is wrapped with your device PIN and stored in IndexedDB only. Never uploaded.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <Sparkles className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none">Optional AI (Mistral)</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                AI features are opt-in. Private messages are never analyzed automatically. Content reaches Mistral only when you
                trigger Rewrite, summarize export, abuse analysis, or smart reply and confirm. Policy:{" "}
                <a
                  href="https://github.com/kulharshit21/SecureTalks/blob/main/docs/AI_PRIVACY.md"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  docs/AI_PRIVACY.md
                </a>
                .
              </p>
            </div>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          CipherSafe is an MVP stack — not a substitute for a full Signal-style audit. Verify safety numbers with contacts when it
          matters.
        </p>
      </TabsContent>

      <TabsContent value="developer" className="mt-5 animate-in fade-in duration-300">
        <SecurityDashboard userId={props.userId} />
      </TabsContent>
    </Tabs>
  );
}

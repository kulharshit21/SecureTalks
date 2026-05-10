"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";

import { useSupabase } from "@/components/providers/supabase-provider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AuditPayload = {
  snapshot?: Record<string, unknown>;
  aiAudit?: {
    routeExists: boolean;
    mentionsNoPromptLogging: boolean;
    usesConsoleLogNearCompletion: boolean;
  };
  cryptoTests?: {
    coreCryptoTestExists: boolean;
    groupCryptoTestExists: boolean;
    noAiOnSendGuardExists: boolean;
  };
  publicEnvKeysCount?: number;
  publicEnvKeysSample?: string[];
  mistralSecretConfigured?: boolean;
  error?: string;
};

function CheckRow(props: { ok: boolean | undefined; label: string; detail?: string }) {
  const ok = props.ok === true;
  return (
    <li className="flex gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-sm">
      <span className={cn("mt-0.5 font-mono text-xs", ok ? "text-emerald-600" : "text-rose-600")}>{ok ? "✓" : "✗"}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium leading-snug">{props.label}</p>
        {props.detail ? <p className="text-xs leading-relaxed text-muted-foreground">{props.detail}</p> : null}
      </div>
    </li>
  );
}

export default function SecurityAuditPage() {
  const supabase = useSupabase();
  const router = useRouter();
  const [payload, setPayload] = useState<AuditPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/security/audit");
      const json = (await res.json()) as AuditPayload;
      if (!cancelled) setPayload(json);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const snap = payload?.snapshot ?? {};
  const plaintextCols = snap.messages_suspicious_plaintext_named_columns as number | undefined;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col gap-8 px-5 py-12">
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <Shield className="size-6 text-primary" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Security audit</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Read-only checks against the database snapshot RPC plus repository probes. This page does not print secrets.
          </p>
          <Link href="/chat" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "rounded-xl")}>
            Back to inbox
          </Link>
        </div>
      </div>

      {!payload ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading audit…
        </div>
      ) : payload.error ? (
        <p className="text-sm text-rose-600">{payload.error}</p>
      ) : (
        <div className="space-y-10">
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plaintext columns</h2>
            <ul className="space-y-2">
              <CheckRow
                ok={plaintextCols === 0}
                label={`Suspicious plaintext-named columns on public.messages: ${plaintextCols ?? "?"}`}
                detail="Heuristic count of columns matching plaintext/body_text/content_text patterns — expect zero."
              />
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Row Level Security</h2>
            <ul className="space-y-2">
              <CheckRow ok={snap.rls_messages === true} label="messages.rls enabled" />
              <CheckRow ok={snap.rls_conversations === true} label="conversations.rls enabled" />
              <CheckRow ok={snap.rls_conversation_members === true} label="conversation_members.rls enabled" />
              <CheckRow ok={snap.rls_attachments === true} label="attachments.rls enabled" />
              <CheckRow ok={snap.rls_devices === true} label="devices.rls enabled" />
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Storage buckets</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Snapshot lists bucket ids and public flags where readable from SQL; null means the RPC could not read storage metadata.
            </p>
            <pre className="overflow-x-auto rounded-xl border border-border/60 bg-muted/20 p-4 text-[11px] leading-relaxed">
              {JSON.stringify(snap.storage_buckets ?? null, null, 2)}
            </pre>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Crypto tests (repo)</h2>
            <ul className="space-y-2">
              <CheckRow ok={payload.cryptoTests?.coreCryptoTestExists} label="src/lib/crypto/crypto.test.ts present" />
              <CheckRow ok={payload.cryptoTests?.groupCryptoTestExists} label="src/lib/crypto/group-crypto.test.ts present" />
              <CheckRow ok={payload.cryptoTests?.noAiOnSendGuardExists} label="no-ai-on-send-path guard present" />
            </ul>
            <p className="text-xs text-muted-foreground">
              CI should run <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">npm run test</code> — this UI only checks files exist.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Environment exposure</h2>
            <ul className="space-y-2">
            <CheckRow
              ok={(payload.publicEnvKeysCount ?? 0) <= 8}
              label={`NEXT_PUBLIC_* keys surfaced to bundle: ${payload.publicEnvKeysCount ?? "?"}`}
              detail="Fewer public env vars reduces accidental leakage — inspect names below."
            />
          </ul>
          <pre className="overflow-x-auto rounded-xl border border-border/60 bg-muted/20 p-4 text-[11px] leading-relaxed">
            {(payload.publicEnvKeysSample ?? []).join(", ") || "(none sampled)"}
          </pre>
          <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">MISTRAL_API_KEY:</span>{" "}
            {payload.mistralSecretConfigured ? "configured on server (never use NEXT_PUBLIC_)." : "not set — AI routes stay disabled."}
          </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI privacy probes</h2>
            <ul className="space-y-2">
              <CheckRow ok={payload.aiAudit?.routeExists} label="Mistral proxy route file exists" />
              <CheckRow ok={payload.aiAudit?.mentionsNoPromptLogging} label='Route comments pledge "Do not log prompts"' />
              <CheckRow
                ok={!payload.aiAudit?.usesConsoleLogNearCompletion}
                label="No obvious console logging around completions"
                detail="Heuristic regex — manual review still required."
              />
            </ul>
          </section>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Generated server-side snapshot timestamp:{" "}
            <span className="font-mono">{String(snap.generated_at ?? "unknown")}</span>
          </p>
        </div>
      )}
    </div>
  );
}

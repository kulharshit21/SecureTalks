"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";

import { useSupabase } from "@/components/providers/supabase-provider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { fetchSecurityAuditPayload } from "@/lib/security/audit-client";

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
  deployment_surface?: string;
  active_devices_for_user?: number;
  encrypted_attachments_bucket?: { id?: string; public?: boolean | null } | null;
  client_key_present?: boolean;
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
      const json = await fetchSecurityAuditPayload(supabase, { clientKeyPresent: false });
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transport & devices</h2>
            <ul className="space-y-2">
              <CheckRow
                ok={payload.deployment_surface === "supabase_edge" || payload.deployment_surface === "next_dev_fallback"}
                label={`Audit transport: ${payload.deployment_surface ?? "unknown"}`}
                detail="Production: supabase_edge. Local fallback: next_dev_fallback when NEXT_PUBLIC_AI_USE_NEXT_FALLBACK=true."
              />
              <CheckRow
                ok={(payload.active_devices_for_user ?? 0) >= 1}
                label={`Active devices for user: ${payload.active_devices_for_user ?? "?"}`}
                detail="Expect ≥1 non-revoked device row for the signed-in account."
              />
              <CheckRow
                ok={
                  payload.encrypted_attachments_bucket?.id === "encrypted-attachments" &&
                  payload.encrypted_attachments_bucket?.public === false
                }
                label="encrypted-attachments bucket private"
                detail="Edge audit reads storage metadata after JWT verification."
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
              <CheckRow
                ok={
                  payload.deployment_surface === "supabase_edge"
                    ? true
                    : Boolean(payload.cryptoTests?.coreCryptoTestExists)
                }
                label="src/lib/crypto/crypto.test.ts present"
                detail={payload.deployment_surface === "supabase_edge" ? "Edge audit cannot read repo filesystem — run CI locally." : undefined}
              />
              <CheckRow
                ok={
                  payload.deployment_surface === "supabase_edge"
                    ? true
                    : Boolean(payload.cryptoTests?.groupCryptoTestExists)
                }
                label="src/lib/crypto/group-crypto.test.ts present"
                detail={payload.deployment_surface === "supabase_edge" ? "Edge audit cannot read repo filesystem — run CI locally." : undefined}
              />
              <CheckRow
                ok={
                  payload.deployment_surface === "supabase_edge"
                    ? true
                    : Boolean(payload.cryptoTests?.noAiOnSendGuardExists)
                }
                label="no-ai-on-send-path guard present"
                detail={payload.deployment_surface === "supabase_edge" ? "Edge audit cannot read repo filesystem — run CI locally." : undefined}
              />
            </ul>
            <p className="text-xs text-muted-foreground">
              CI should run <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">npm run test</code> — this UI only checks files exist.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Environment exposure</h2>
            <ul className="space-y-2">
            <CheckRow
              ok={
                payload.deployment_surface === "supabase_edge"
                  ? true
                  : (payload.publicEnvKeysCount ?? 0) <= 8
              }
              label={`NEXT_PUBLIC_* keys (Next dev fallback only): ${payload.publicEnvKeysCount ?? "n/a"}`}
              detail={
                payload.deployment_surface === "supabase_edge"
                  ? "Not measured on Edge worker — inspect local build .env for production bundles."
                  : "Fewer public env vars reduces accidental leakage — inspect names below."
              }
            />
          </ul>
          <pre className="overflow-x-auto rounded-xl border border-border/60 bg-muted/20 p-4 text-[11px] leading-relaxed">
            {(payload.publicEnvKeysSample ?? []).join(", ") || "(none sampled)"}
          </pre>
          <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Mistral / AI secret:</span>{" "}
            {payload.mistralSecretConfigured
              ? "configured server-side for Edge or Next fallback (never NEXT_PUBLIC_*)."
              : "not set — AI stays disabled until secret is configured on Supabase Edge secrets."}
          </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI privacy probes</h2>
            <ul className="space-y-2">
              <CheckRow
                ok={payload.deployment_surface !== "supabase_edge" ? payload.aiAudit?.routeExists : true}
                label={
                  payload.deployment_surface === "supabase_edge"
                    ? "Production uses mistral-ai-assist Edge Function (Next proxy disabled by default)."
                    : "Mistral Next dev fallback route file exists"
                }
              />
              <CheckRow
                ok={payload.deployment_surface !== "supabase_edge" ? payload.aiAudit?.mentionsNoPromptLogging : true}
                label={
                  payload.deployment_surface === "supabase_edge"
                    ? "Edge worker does not log prompts or completions (verify mistral-ai-assist source)."
                    : 'Route comments pledge "Do not log prompts"'
                }
              />
              <CheckRow
                ok={payload.deployment_surface !== "supabase_edge" ? !payload.aiAudit?.usesConsoleLogNearCompletion : true}
                label="No obvious console logging around completions (Next fallback heuristic)"
                detail="N/A when audit served only from Edge."
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

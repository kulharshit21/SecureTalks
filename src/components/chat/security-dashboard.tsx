"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, Database, Fingerprint, KeyRound, ShieldCheck } from "lucide-react";

import { useSupabase } from "@/components/providers/supabase-provider";
import { Separator } from "@/components/ui/separator";
import { loadWrappedRecord } from "@/lib/device-vault";
import { parsePublicKeyBundleJson } from "@/lib/crypto/session";
import { fetchPublicBundleJsonForDevice } from "@/lib/conversation-service";
import { cn } from "@/lib/utils";

type LatestMessageProbe = {
  id: string;
  ciphertext: string;
  nonce: string;
  sender_device_id: string;
};

type PillTone = "loading" | "success" | "warning" | "error";

export function SecurityDashboard(props: { userId: string }) {
  const supabase = useSupabase();

  const [vaultPresent, setVaultPresent] = useState<boolean | null>(null);
  const [messagesProbe, setMessagesProbe] = useState<LatestMessageProbe | null>(null);
  const [myPublicKey, setMyPublicKey] = useState<string | null>(null);
  /** "loading" | "synced" | "pending" — pending = no device row or keys not published yet (not an error). */
  const [bundleStatus, setBundleStatus] = useState<"loading" | "synced" | "pending">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const vault = await loadWrappedRecord(props.userId);
      if (cancelled) return;
      setVaultPresent(Boolean(vault));

      const { data: msg } = await supabase
        .from("messages")
        .select("id, ciphertext, nonce, sender_device_id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setMessagesProbe(msg ? (msg as LatestMessageProbe) : null);

      const { data: device } = await supabase.from("devices").select("id").eq("user_id", props.userId).maybeSingle();
      if (!device?.id) {
        if (!cancelled) {
          setMyPublicKey(null);
          setBundleStatus("pending");
        }
        return;
      }

      const bundleJson = await fetchPublicBundleJsonForDevice(supabase, device.id as string);

      if (cancelled) return;
      setMyPublicKey(bundleJson ?? null);
      setBundleStatus(bundleJson ? "synced" : "pending");
    })().catch(() => {
      if (!cancelled) {
        setVaultPresent(false);
        setBundleStatus("pending");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [props.userId, supabase]);

  const keyFingerprint = useMemo(() => {
    if (!myPublicKey) return null;
    try {
      const parsed = parsePublicKeyBundleJson(myPublicKey);
      const prefix = parsed.identityDhPublicKey.slice(0, 4);
      return [...prefix].map((b) => b.toString(16).padStart(2, "0")).join("") + "…";
    } catch {
      return null;
    }
  }, [myPublicKey]);

  const ciphertextPreview = useMemo(() => {
    if (!messagesProbe) return null;
    const slice = messagesProbe.ciphertext.slice(0, 48);
    return `${slice}… (${messagesProbe.ciphertext.length} chars)`;
  }, [messagesProbe]);

  const vaultOk = vaultPresent === true;
  const bundleOk = Boolean(myPublicKey);
  const probeOk = Boolean(messagesProbe);

  const deviceKeysTone: PillTone =
    bundleStatus === "loading" ? "loading" : bundleStatus === "synced" ? "success" : "warning";

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[1.35rem] border border-border/60 bg-gradient-to-br from-card/90 via-card/60 to-muted/20 p-6 shadow-lg ring-1 ring-black/[0.03] backdrop-blur-xl dark:from-card/50 dark:via-card/35 dark:to-muted/10 dark:ring-white/[0.05] md:p-8">
        <div className="pointer-events-none absolute -right-24 top-0 size-72 rounded-full bg-primary/[0.07] blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/20">
              <Activity className="size-6 text-primary" strokeWidth={1.75} aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight md:text-xl">Technical diagnostics</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                For developers and audits — inspectable signals only. No plaintext logging, no private keys sent to this panel.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 md:mt-0 md:justify-end">
            <StatusPill tone={vaultPresent === null ? "loading" : vaultOk ? "success" : "error"} label="Vault" />
            <StatusPill tone={deviceKeysTone} label="Device keys" />
          </div>
        </div>

        <div className="relative mt-8 grid gap-4 md:grid-cols-3">
          <StatTile
            icon={KeyRound}
            title="IndexedDB vault"
            value={vaultPresent === null ? "Checking…" : vaultPresent ? "Wrapped secret present" : "Missing"}
            hint="Private keys exist only as AES-GCM ciphertext in the browser."
            variant={vaultPresent === null ? "neutral" : vaultOk ? "good" : "bad"}
          />
          <StatTile
            icon={Fingerprint}
            title="Public bundle"
            value={myPublicKey ? "Synced to Supabase" : "Not published yet"}
            hint={
              keyFingerprint
                ? `DH prefix: ${keyFingerprint}`
                : "Finish device setup to publish public keys (expected until first successful registration)."
            }
            variant={bundleOk ? "good" : "pending"}
          />
          <StatTile
            icon={ShieldCheck}
            title="Latest ciphertext row"
            value={messagesProbe ? "Envelope retrieved" : "No rows visible"}
            hint={
              messagesProbe
                ? "Format looks like opaque payload — not human language."
                : "Normal for an empty inbox, or RLS returns only messages in chats you belong to."
            }
            variant={probeOk ? "good" : "pending"}
          />
        </div>

        <Separator className="my-8 bg-border/60" />

        <div className="relative space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Database className="size-3.5" aria-hidden />
            Raw probe (global latest message)
          </div>
          {!messagesProbe ? (
            <p className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
              No row returned — often an empty project or RLS scoped to your conversations (not necessarily a failure).
            </p>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-muted/[0.12] p-4 font-mono text-[11px] leading-relaxed shadow-inner md:p-5 md:text-xs">
              <div className="flex flex-wrap gap-x-3 gap-y-2 border-b border-border/40 pb-3">
                <span className="text-muted-foreground">id</span>
                <span className="break-all text-foreground/90">{messagesProbe.id}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 border-b border-border/40 pb-3">
                <span className="text-muted-foreground">sender_device_id</span>
                <span className="break-all">{messagesProbe.sender_device_id}</span>
              </div>
              <div className="mt-3 border-b border-border/40 pb-3">
                <span className="text-muted-foreground">ciphertext (base64 prefix)</span>
                <div className="mt-1.5 break-all text-foreground/85">{ciphertextPreview}</div>
              </div>
              <div className="mt-3">
                <span className="text-muted-foreground">nonce</span>
                <div className="mt-1.5 break-all">{messagesProbe.nonce}</div>
              </div>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            If human-readable sentences appear in <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">ciphertext</code>, the
            client-first encrypt rule was violated.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusPill(props: { tone: PillTone; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
        props.tone === "loading" && "border-border/60 bg-muted/30 text-muted-foreground",
        props.tone === "success" && "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        props.tone === "warning" && "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-400",
        props.tone === "error" && "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-400",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          props.tone === "loading" && "animate-pulse bg-muted-foreground/60",
          props.tone === "success" && "bg-emerald-500",
          props.tone === "warning" && "bg-amber-500",
          props.tone === "error" && "bg-rose-500",
        )}
      />
      {props.label}
    </span>
  );
}

function StatTile(props: {
  icon: LucideIcon;
  title: string;
  value: string;
  hint: string;
  variant: "good" | "bad" | "neutral" | "pending";
}) {
  const Icon = props.icon;
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-5 transition-colors",
        props.variant === "good" && "border-emerald-500/25 bg-emerald-500/[0.06]",
        props.variant === "bad" && "border-rose-500/25 bg-rose-500/[0.06]",
        props.variant === "pending" && "border-amber-500/20 bg-amber-500/[0.04] dark:border-amber-500/25",
        props.variant === "neutral" && "border-border/55 bg-background/50 dark:bg-background/20",
      )}
    >
      <Icon className="size-5 text-foreground/75" strokeWidth={1.75} aria-hidden />
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{props.title}</p>
      <p className="mt-2 text-[15px] font-semibold leading-snug tracking-tight">{props.value}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{props.hint}</p>
    </div>
  );
}

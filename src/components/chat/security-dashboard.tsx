"use client";

import { useEffect, useMemo, useState } from "react";

import { useSupabase } from "@/components/providers/supabase-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { loadWrappedRecord } from "@/lib/device-vault";
import { parsePublicKeyBundleJson } from "@/lib/crypto/session";
import { fetchPublicBundleJsonForDevice } from "@/lib/conversation-service";

type LatestMessageProbe = {
  id: string;
  ciphertext: string;
  nonce: string;
  sender_device_id: string;
};

export function SecurityDashboard(props: { userId: string }) {
  const supabase = useSupabase();

  const [vaultPresent, setVaultPresent] = useState<boolean | null>(null);
  const [messagesProbe, setMessagesProbe] = useState<LatestMessageProbe | null>(null);
  const [myPublicKey, setMyPublicKey] = useState<string | null>(null);

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
        setMyPublicKey(null);
        return;
      }

      const bundleJson = await fetchPublicBundleJsonForDevice(supabase, device.id as string);

      if (cancelled) return;
      setMyPublicKey(bundleJson ?? null);
    })().catch(() => {
      if (!cancelled) setVaultPresent(false);
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

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-background/55 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-base">Developer security dashboard</CardTitle>
          <CardDescription>
            This panel exists to make privacy claims inspectable. It never logs message plaintext or private keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <Stat
              title="IndexedDB vault"
              value={vaultPresent === null ? "Checking…" : vaultPresent ? "Present (wrapped secret key)" : "Missing"}
              hint="Private keys should exist only as AES-GCM ciphertext inside IndexedDB."
            />
            <Stat
              title="Supabase public bundle"
              value={myPublicKey ? "Uploaded (devices + OTPKs)" : "Not found"}
              hint={keyFingerprint ? `Fingerprint prefix: ${keyFingerprint}` : "Register this device to upload keys."}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Latest messages row probe (global)
            </p>
            {!messagesProbe ? (
              <p className="text-muted-foreground">No rows returned (empty database or no access).</p>
            ) : (
              <div className="rounded-2xl border border-border/70 bg-muted/10 p-4 font-mono text-xs leading-relaxed">
                <div className="flex flex-wrap gap-x-3 gap-y-2">
                  <span className="text-muted-foreground">id</span>
                  <span>{messagesProbe.id}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
                  <span className="text-muted-foreground">sender_device_id</span>
                  <span>{messagesProbe.sender_device_id}</span>
                </div>
                <div className="mt-2">
                  <span className="text-muted-foreground">ciphertext (base64 prefix)</span>
                  <div className="mt-1 break-all">{ciphertextPreview}</div>
                </div>
                <div className="mt-2">
                  <span className="text-muted-foreground">nonce (base64)</span>
                  <div className="mt-1 break-all">{messagesProbe.nonce}</div>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              If you can read human language in `ciphertext`, something violated the client-first encrypt rule.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat(props: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{props.title}</p>
      <p className="mt-2 text-base font-semibold">{props.value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{props.hint}</p>
    </div>
  );
}

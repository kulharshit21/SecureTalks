"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, QrCode } from "lucide-react";

import type { ParsedPublicKeyBundle } from "@/lib/crypto/types";
import { fingerprintQrPayloadUri, formatSafetyNumber } from "@/lib/crypto/fingerprints";
import { setPeerVerifiedLocally } from "@/lib/local-verification";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function VerificationModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  peerUserId: string | null;
  peerLabel: string;
  peerBundle: ParsedPublicKeyBundle | null;
  myIdentityDhPublicKey: Uint8Array | null;
  peerVerified: boolean;
  onVerifiedChange: () => void;
}) {
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open || !props.peerBundle || !props.myIdentityDhPublicKey) {
      queueMicrotask(() => {
        setSafetyNumber(null);
        setQrUri(null);
      });
      return;
    }
    let cancelled = false;
    (async () => {
      const sn = await formatSafetyNumber(props.myIdentityDhPublicKey!, props.peerBundle!.identityDhPublicKey);
      const uri = await fingerprintQrPayloadUri(props.myIdentityDhPublicKey!, props.peerBundle!.identityDhPublicKey);
      if (!cancelled) {
        setSafetyNumber(sn);
        setQrUri(uri);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.open, props.peerBundle, props.myIdentityDhPublicKey]);

  function markVerified() {
    if (!props.peerUserId) return;
    setPeerVerifiedLocally(props.peerUserId, true);
    props.onVerifiedChange();
    props.onOpenChange(false);
  }

  const ready = Boolean(props.peerBundle && props.myIdentityDhPublicKey);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-border/70 p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border/60 px-6 py-5 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">Verify {props.peerLabel}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Compare this safety number with your contact out-of-band. It is derived from both identity keys — no server sees it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          {!ready ? (
            <p className="text-sm text-muted-foreground">Keys are still loading for this conversation.</p>
          ) : (
            <>
              <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Safety number</p>
                <p className="mt-2 font-mono text-xs leading-relaxed tracking-wide text-foreground">{safetyNumber}</p>
              </div>

              <div className="flex gap-4">
                <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-background/60 px-3 py-8">
                  <QrCode className="mb-3 size-10 text-muted-foreground/70" strokeWidth={1.25} aria-hidden />
                  <p className="text-center text-[11px] text-muted-foreground">QR placeholder</p>
                  <p className="mt-2 max-w-[200px] truncate text-center font-mono text-[10px] text-muted-foreground/80">
                    {qrUri}
                  </p>
                </div>
              </div>

              {props.peerVerified ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                  Marked verified on this device
                </div>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/10 px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => props.onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" size="sm" disabled={!ready || props.peerVerified || !props.peerUserId} onClick={markVerified}>
            Mark verified locally
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabase } from "@/components/providers/supabase-provider";
import {
  CRYPTO_PROTOCOL_ID,
  CRYPTO_PROTOCOL_VERSION,
  type PublicKeyBundleRecord,
  type UnlockedPrivateCrypto,
} from "@/lib/crypto/types";
import {
  generateIdentityMaterial,
  unlockedPrivateCryptoFromVault,
} from "@/lib/crypto/identity";
import { generateSignedPreKey, generateOneTimePreKeys } from "@/lib/crypto/prekeys";
import { serializePrivateCryptoBundle, bytesToB64 } from "@/lib/crypto/keys";
import { publicBundleRecordToJson } from "@/lib/crypto/session";
import { cryptoSecretStorage } from "@/lib/crypto/storage";
import { deleteVaultRecord, loadWrappedRecord, storeWrappedIdentity, unlockIdentity } from "@/lib/device-vault";
import { APP_NAME } from "@/lib/brand";
import { useCipherSession } from "@/stores/cipher-session";

type Phase = "loading" | "setup" | "unlock";
type SetupStep = "welcome" | "device" | "pin";

export function DeviceGate(props: { userId: string; children: React.ReactNode }) {
  const supabase = useSupabase();
  const cipherSession = useCipherSession();

  const [phase, setPhase] = useState<Phase>("loading");
  const [setupStep, setSetupStep] = useState<SetupStep>("welcome");

  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");

  const [setupPin, setSetupPin] = useState("");
  const [setupPin2, setSetupPin2] = useState("");
  const [unlockPin, setUnlockPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [forgotPinOpen, setForgotPinOpen] = useState(false);
  const [recoverySoonOpen, setRecoverySoonOpen] = useState(false);
  const [resetDeviceOpen, setResetDeviceOpen] = useState(false);
  const [resetAccountPassword, setResetAccountPassword] = useState("");
  const [resetDialogError, setResetDialogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await loadWrappedRecord(props.userId);
      if (cancelled) return;
      setPhase(existing ? "unlock" : "setup");
      if (!existing) {
        setSetupStep("welcome");
      }
    })().catch(() => {
      if (!cancelled) {
        setError("Unable to read encrypted device vault state.");
        setPhase("setup");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("username").eq("id", props.userId).maybeSingle();
      if (cancelled || !data) return;
      setProfileUsername(String(data.username ?? ""));
    })();
    return () => {
      cancelled = true;
    };
  }, [props.userId, supabase]);

  const sessionReady =
    cipherSession.userId === props.userId &&
    Boolean(cipherSession.deviceId && cipherSession.privateCrypto);

  const title = useMemo(() => {
    if (phase === "setup") {
      if (setupStep === "welcome") return "Welcome";
      if (setupStep === "device") return "Name this device";
      return "Create device lock";
    }
    if (phase === "unlock") return "Unlock messenger";
    return "";
  }, [phase, setupStep]);

  async function runKeyGeneration() {
    setError(null);
    if (setupPin.length < 10 || setupPin !== setupPin2) {
      setError("PIN must match and be at least 10 characters.");
      return;
    }

    const resolvedDeviceName = deviceName.trim() || "Browser";

    setBusy(true);
    try {
      const identity = await generateIdentityMaterial();
      const signedPreKey = await generateSignedPreKey(identity.signing);
      const otps = await generateOneTimePreKeys(32);

      const record: PublicKeyBundleRecord = {
        v: CRYPTO_PROTOCOL_VERSION,
        identityDhPublicKeyB64: bytesToB64(identity.dh.publicKey),
        identitySigningPublicKeyB64: bytesToB64(identity.signing.publicKey),
        signedPreKey: {
          id: signedPreKey.id,
          publicKeyB64: bytesToB64(signedPreKey.publicKey),
          signatureB64: bytesToB64(signedPreKey.signature),
        },
        oneTimePreKeys: otps.map((k) => ({ id: k.id, publicKeyB64: bytesToB64(k.publicKey) })),
      };

      const publicBundleJson = publicBundleRecordToJson(record);

      const privatePlain = serializePrivateCryptoBundle({
        identityDhSecret: identity.dh.secretKey,
        identitySigningSecret: identity.signing.secretKey,
        signedPreKeyId: signedPreKey.id,
        signedPreKeySecret: signedPreKey.secretKey,
        oneTimePreKeys: new Map(otps.map((k) => [k.id, k.secretKey])),
      });

      const { data: deviceRow, error: deviceErr } = await supabase
        .from("devices")
        .insert({
          user_id: props.userId,
          device_name: resolvedDeviceName,
          device_type: "web",
          identity_public_key: bytesToB64(identity.dh.publicKey),
          identity_signing_public_key: bytesToB64(identity.signing.publicKey),
          signed_prekey_key_id: signedPreKey.id,
          signed_prekey_public: bytesToB64(signedPreKey.publicKey),
          signed_prekey_signature: bytesToB64(signedPreKey.signature),
        })
        .select("id")
        .single();

      if (deviceErr) throw deviceErr;
      const deviceId = deviceRow.id as string;

      const { error: otpErr } = await supabase.from("one_time_prekeys").insert(
        otps.map((k) => ({
          user_id: props.userId,
          device_id: deviceId,
          key_id: k.id,
          public_key: bytesToB64(k.publicKey),
        })),
      );
      if (otpErr) throw otpErr;

      await storeWrappedIdentity({
        userId: props.userId,
        pin: setupPin,
        deviceId,
        privateBundlePlain: privatePlain,
        publicBundleJson,
        protocolId: CRYPTO_PROTOCOL_ID,
      });

      await supabase.from("security_events").insert({
        user_id: props.userId,
        event_type: "device_registered",
        metadata: { device_id: deviceId, protocol: CRYPTO_PROTOCOL_ID },
      });

      const privateCrypto: UnlockedPrivateCrypto = {
        identityDh: identity.dh,
        identitySigning: identity.signing,
        signedPreKey: {
          id: signedPreKey.id,
          secretKey: signedPreKey.secretKey,
          publicKey: signedPreKey.publicKey,
        },
        oneTimePreKeys: new Map(otps.map((k) => [k.id, k.secretKey])),
      };

      cipherSession.unlock({ userId: props.userId, deviceId, privateCrypto });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Setup failed.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function confirmResetDevice() {
    setResetDialogError(null);
    const pw = resetAccountPassword.trim();
    if (pw.length < 8) {
      setResetDialogError("Enter your account password to confirm.");
      return;
    }
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email?.trim();
      if (!email) {
        throw new Error("Sign in again, then retry reset.");
      }

      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (reauthErr) {
        throw new Error("That password doesn’t match this account.");
      }

      const vault = await loadWrappedRecord(props.userId);
      if (!vault) {
        throw new Error("No local vault found — try setting up this device again.");
      }

      const { error: revokeErr } = await supabase
        .from("devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", vault.deviceId)
        .eq("user_id", props.userId);

      if (revokeErr) {
        throw revokeErr;
      }

      await deleteVaultRecord(props.userId);
      await cryptoSecretStorage.clearNamespace(props.userId);
      cipherSession.lock();
      setUnlockPin("");
      setResetAccountPassword("");
      setResetDeviceOpen(false);
      setForgotPinOpen(false);
      setResetDialogError(null);
      setPhase("setup");
      setSetupStep("welcome");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Reset failed.";
      setResetDialogError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onUnlock() {
    setError(null);
    setBusy(true);
    try {
      const unlockedVault = await unlockIdentity({ userId: props.userId, pin: unlockPin });
      if (unlockedVault.protocolId !== CRYPTO_PROTOCOL_ID) {
        throw new Error("This vault uses an unsupported protocol revision.");
      }

      const privateCrypto = await unlockedPrivateCryptoFromVault(unlockedVault.decryptedPrivateBundle);

      cipherSession.unlock({
        userId: props.userId,
        deviceId: unlockedVault.deviceId,
        privateCrypto,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unlock failed.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (sessionReady) {
    return props.children;
  }

  if (phase === "loading") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-48 w-full max-w-md rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-background via-background to-muted/25 px-4 py-16 animate-in fade-in duration-500">
      <Card className="w-full max-w-lg overflow-hidden border-border/60 bg-card/75 shadow-2xl shadow-black/5 backdrop-blur-xl dark:shadow-black/30">
        <CardHeader className="space-y-2 border-b border-border/50 bg-muted/10 px-8 py-8">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/12 ring-1 ring-primary/20">
              <KeyRound className="size-5 text-primary" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
              {profileUsername ? (
                <CardDescription className="mt-1 text-xs">Signed in as @{profileUsername}</CardDescription>
              ) : (
                <CardDescription className="mt-1 text-xs">Device encryption setup</CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-8 py-8">
          {error ? (
            <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {phase === "setup" && setupStep === "welcome" ? (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-4">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                  <p className="font-medium text-foreground">Recovery warning</p>
                  <p>
                    Your PIN protects the private key on this device. If you lose it, <strong>old messages may not open</strong>{" "}
                    here without your recovery key. {APP_NAME} cannot unlock them for you.
                  </p>
                  <p>Use a passphrase you can rehearse. Consider a password manager.</p>
                </div>
              </div>
              <Button className="h-11 w-full rounded-xl font-medium" type="button" onClick={() => setSetupStep("device")}>
                Continue
              </Button>
            </div>
          ) : null}

          {phase === "setup" && setupStep === "device" ? (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <p className="text-sm text-muted-foreground">
                This label appears on your device row for your reference. It is not shared as your profile name.
              </p>
              <div className="space-y-2">
                <Label htmlFor="device-name">Device name</Label>
                <Input
                  id="device-name"
                  className="h-11 rounded-xl"
                  placeholder="e.g. MacBook · Personal phone"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="h-11 flex-1 rounded-xl" type="button" onClick={() => setSetupStep("welcome")}>
                  Back
                </Button>
                <Button
                  className="h-11 flex-1 rounded-xl font-medium"
                  type="button"
                  onClick={() => setSetupStep("pin")}
                  disabled={!deviceName.trim()}
                >
                  Continue
                </Button>
              </div>
            </div>
          ) : null}

          {phase === "setup" && setupStep === "pin" ? (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <p className="text-sm text-muted-foreground">
                Generate encryption keys and wrap them with your PIN. Keys never leave this browser unencrypted.
              </p>
              <div className="space-y-2">
                <Label htmlFor="pin">Device PIN</Label>
                <Input
                  id="pin"
                  type="password"
                  className="h-11 rounded-xl"
                  autoComplete="new-password"
                  value={setupPin}
                  onChange={(e) => setSetupPin(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin2">Confirm PIN</Label>
                <Input
                  id="pin2"
                  type="password"
                  className="h-11 rounded-xl"
                  autoComplete="new-password"
                  value={setupPin2}
                  onChange={(e) => setSetupPin2(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="h-11 flex-1 rounded-xl" type="button" onClick={() => setSetupStep("device")}>
                  Back
                </Button>
                <Button className="h-11 flex-1 rounded-xl font-medium" disabled={busy} onClick={() => void runKeyGeneration()}>
                  {busy ? "Generating keys…" : "Generate keys & finish"}
                </Button>
              </div>
            </div>
          ) : null}

          {phase === "unlock" ? (
            <div className="space-y-5 animate-in fade-in duration-300">
              <p className="text-sm text-muted-foreground">Enter your device PIN to unlock messaging on this browser.</p>
              <div className="space-y-2">
                <Label htmlFor="unlock-pin">Device PIN</Label>
                <Input
                  id="unlock-pin"
                  type="password"
                  className="h-11 rounded-xl"
                  autoComplete="current-password"
                  value={unlockPin}
                  onChange={(e) => setUnlockPin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onUnlock();
                  }}
                />
              </div>
              <Button className="h-11 w-full rounded-xl font-medium" disabled={busy} onClick={() => void onUnlock()}>
                Unlock
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setForgotPinOpen(true);
                }}
              >
                Forgot device PIN?
              </button>
              <Button
                variant="outline"
                className="h-11 w-full rounded-xl text-muted-foreground"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await deleteVaultRecord(props.userId);
                    await cryptoSecretStorage.clearNamespace(props.userId);
                    cipherSession.lock();
                    setUnlockPin("");
                    setPhase("setup");
                    setSetupStep("welcome");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove keys from this browser
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Need your account password?{" "}
                <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/forgot-password">
                  Reset access
                </Link>
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={forgotPinOpen} onOpenChange={setForgotPinOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Forgot device PIN?</DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed">
              Your PIN protects the private key on this device. If you reset it, you may need your recovery key to restore old
              messages on this browser.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Button
              variant="secondary"
              className="h-11 rounded-xl"
              type="button"
              onClick={() => {
                setForgotPinOpen(false);
                setRecoverySoonOpen(true);
              }}
            >
              I have my recovery key
            </Button>
            <Button
              variant="default"
              className="h-11 rounded-xl"
              type="button"
              onClick={() => {
                setForgotPinOpen(false);
                setResetDeviceOpen(true);
              }}
            >
              Reset this device
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" type="button" onClick={() => setForgotPinOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recoverySoonOpen} onOpenChange={setRecoverySoonOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Recovery key restore</DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed">
              Recovery key restore is coming soon. You can reset this device now with your account password, but{" "}
              <strong>older messages may not decrypt</strong> without the original device key or a future recovery flow.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" type="button" onClick={() => setRecoverySoonOpen(false)}>
              Close
            </Button>
            <Button
              className="rounded-xl"
              type="button"
              onClick={() => {
                setRecoverySoonOpen(false);
                setResetDeviceOpen(true);
              }}
            >
              Reset device access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetDeviceOpen} onOpenChange={(o) => {
        setResetDeviceOpen(o);
        if (!o) {
          setResetDialogError(null);
          setResetAccountPassword("");
        }
      }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reset device access</DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed">
              Verify by entering your <strong>account password</strong> (not your device PIN). We&apos;ll revoke this device&apos;s
              keys in your account, clear local data, and let you create a new device key. Your account stays open, but{" "}
              <strong>old messages may not open</strong> without the original keys or recovery.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reset-acct-pw">Account password</Label>
            <Input
              id="reset-acct-pw"
              type="password"
              autoComplete="current-password"
              className="h-11 rounded-xl"
              value={resetAccountPassword}
              onChange={(e) => setResetAccountPassword(e.target.value)}
            />
          </div>
          {resetDialogError ? <p className="text-sm text-destructive">{resetDialogError}</p> : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" type="button" onClick={() => setResetDeviceOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-xl" type="button" disabled={busy} onClick={() => void confirmResetDevice()}>
              {busy ? "Working…" : "Verify & reset device"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

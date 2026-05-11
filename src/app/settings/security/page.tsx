"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, KeyRound, KeySquare, Shield, Smartphone } from "lucide-react";

import { APP_NAME } from "@/lib/brand";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSupabase } from "@/components/providers/supabase-provider";
import { cn } from "@/lib/utils";

type DeviceRow = { id: string; device_name: string | null; revoked_at: string | null; created_at: string };

export default function SecuritySettingsPage() {
  const supabase = useSupabase();
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      if (cancelled) return;
      const { data } = await supabase
        .from("devices")
        .select("id, device_name, revoked_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setDevices((data ?? []) as DeviceRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  return (
    <div className="relative min-h-[100dvh]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_45%_at_50%_-15%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)]" />
      <div className="relative mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-8 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/chat"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "-ml-2 gap-1 rounded-xl text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowLeft className="size-4" aria-hidden />
              <span className="text-xs font-medium sm:text-sm">Chats</span>
            </Link>
          </div>
          <div>
            <h1 className="font-sans text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Security</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Keys, devices, and privacy tools for your {APP_NAME} account.
            </p>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          <Card className="border-border/60 shadow-sm sm:col-span-1">
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="flex items-center gap-2 font-sans text-base font-semibold">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
                  <KeyRound className="size-4 text-primary" aria-hidden />
                </span>
                Device PIN
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Change your PIN from the in-app unlock screen. If you&apos;re locked out, use recovery below.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link href="/recover-device" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-10 w-full rounded-xl sm:w-auto")}>
                Forgot PIN or reset device
                <ChevronRight className="ml-1 size-4 opacity-70" aria-hidden />
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-muted/20 shadow-sm sm:col-span-1">
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="flex items-center gap-2 font-sans text-base font-semibold">
                <span className="flex size-9 items-center justify-center rounded-xl bg-muted">
                  <KeySquare className="size-4 text-muted-foreground" aria-hidden />
                </span>
                Recovery key
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Export a backup key to recover on a new browser. Shipping in a future update.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button type="button" disabled variant="secondary" size="sm" className="h-10 w-full cursor-not-allowed rounded-xl opacity-70 sm:w-auto">
                Coming soon
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm sm:col-span-2">
            <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 font-sans text-base font-semibold">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
                    <Shield className="size-4 text-primary" aria-hidden />
                  </span>
                  Privacy check
                </CardTitle>
                <CardDescription className="max-w-xl text-sm leading-relaxed">
                  Read-only snapshot: RLS, storage, and environment signals for this account. No secrets shown.
                </CardDescription>
              </div>
              <Link
                href="/security"
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "h-10 shrink-0 rounded-xl px-5")}
              >
                Run check
              </Link>
            </CardHeader>
          </Card>

          <Card className="border-border/60 shadow-sm sm:col-span-2">
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="flex items-center gap-2 font-sans text-base font-semibold">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
                  <Smartphone className="size-4 text-primary" aria-hidden />
                </span>
                Your devices
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Devices currently signed in to this account. Revoked devices are hidden by server policy so they don&apos;t appear
                here.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading devices…</p>
              ) : devices.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
                  No devices found. Open the app on this browser to register one.
                </p>
              ) : (
                <ul className="space-y-2">
                  {devices.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 dark:border-emerald-500/25"
                    >
                      <span className="font-medium text-foreground">{d.device_name?.trim() || "This device"}</span>
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 bg-emerald-500/10 font-medium text-emerald-800 dark:text-emerald-400"
                      >
                        Active
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyRound, Shield, Smartphone } from "lucide-react";

import { APP_NAME } from "@/lib/brand";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
    <div className="mx-auto min-h-[100dvh] max-w-lg px-5 py-10">
      <div className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">Account and devices for {APP_NAME}.</p>
      </div>

      <div className="space-y-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <KeyRound className="size-4 text-primary" aria-hidden />
              Device PIN
            </CardTitle>
            <CardDescription>
              Change your PIN from the unlock screen in the app (coming soon here). Use &quot;Forgot device PIN?&quot; if you&apos;re locked out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/recover-device"
              className={cn(buttonVariants({ variant: "outline" }), "inline-flex rounded-xl px-4")}
            >
              Device recovery help
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border/60 opacity-80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Recovery key</CardTitle>
            <CardDescription>Export a recovery key — coming soon. Not available yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" disabled className="rounded-xl" variant="secondary">
              Generate (soon)
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Shield className="size-4 text-primary" aria-hidden />
              Privacy check
            </CardTitle>
            <CardDescription>Technical diagnostics for audits.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/security" className={cn(buttonVariants({ variant: "default" }), "inline-flex rounded-xl px-4")}>
              Open privacy check
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Smartphone className="size-4 text-primary" aria-hidden />
              Active devices
            </CardTitle>
            <CardDescription>
              Devices currently available for messaging (revoked rows are hidden by policy).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {devices.map((d) => (
                  <li key={d.id} className="rounded-xl border border-border/50 bg-muted/10 px-3 py-2">
                    <span className="font-medium">{d.device_name || "Device"}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {d.revoked_at ? "Revoked" : "Active"}
                    </span>
                  </li>
                ))}
                {devices.length === 0 ? <li className="text-muted-foreground">No devices yet.</li> : null}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator className="my-8" />

      <Link href="/chat" className={cn(buttonVariants({ variant: "ghost" }), "rounded-xl px-4")}>
        Back to chats
      </Link>
    </div>
  );
}

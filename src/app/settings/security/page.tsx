"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyRound, KeySquare, Shield, Smartphone } from "lucide-react";

import { APP_NAME } from "@/lib/brand";
import {
  SettingsGroup,
  SettingsPageHeader,
  SettingsRow,
  SettingsRowLink,
  SettingsSection,
  SettingsShell,
} from "@/components/settings/settings-shell";
import { Badge } from "@/components/ui/badge";
import { useSupabase } from "@/components/providers/supabase-provider";

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
    <SettingsShell>
      <SettingsPageHeader
        title="Security"
        description={`Keys, devices, and privacy tools for your ${APP_NAME} account.`}
        backHref="/chat"
        backLabel="Chats"
      />

      <div className="space-y-10">
        <SettingsSection
          title="Access"
          description="Protect unlocking and backups for this browser."
        >
          <SettingsGroup>
            <SettingsRowLink
              href="/recover-device"
              icon={KeyRound}
              title="Device PIN"
              description="Forgot PIN, or reset keys for this device — opens recovery steps."
            />
            <SettingsRow
              icon={KeySquare}
              iconMuted
              title="Recovery key"
              description="Export a backup key for a new browser. Not available yet."
              trailing={
                <Badge variant="secondary" className="pointer-events-none shrink-0 border border-border/60 font-medium opacity-80">
                  Soon
                </Badge>
              }
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title="Privacy" description="Read-only checks for your account — no secrets displayed.">
          <SettingsGroup>
            <SettingsRowLink
              href="/security"
              icon={Shield}
              title="Privacy check"
              description="Snapshot of RLS, storage, and environment signals."
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          title="Devices"
          description="Devices signed in right now. Revoked devices are hidden by server policy."
        >
          <SettingsGroup>
            {loading ? (
              <div className="px-4 py-6 text-sm text-muted-foreground sm:px-5">Loading devices…</div>
            ) : devices.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
                No devices yet. Open the app in this browser to register one.
              </div>
            ) : (
              devices.map((d) => (
                <SettingsRow
                  key={d.id}
                  icon={Smartphone}
                  title={d.device_name?.trim() || "This device"}
                  description="Signed in and active."
                  trailing={
                    <Badge
                      variant="outline"
                      className="shrink-0 border-emerald-500/40 bg-emerald-500/10 font-medium text-emerald-800 dark:text-emerald-400"
                    >
                      Active
                    </Badge>
                  }
                />
              ))
            )}
          </SettingsGroup>
        </SettingsSection>
      </div>
    </SettingsShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import { KeyRound, LogIn, Mail, MessageCircle } from "lucide-react";

import {
  SettingsGroup,
  SettingsPageHeader,
  SettingsRowLink,
  SettingsSection,
  SettingsShell,
} from "@/components/settings/settings-shell";
import { useSupabase } from "@/components/providers/supabase-provider";

export default function RecoverDevicePage() {
  const supabase = useSupabase();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, [supabase]);

  return (
    <SettingsShell>
      <SettingsPageHeader
        title="Device access"
        description="Your device PIN protects local message keys — not your account password. Old messages may not decrypt after a full device reset."
        backHref={signedIn === true ? "/settings/security" : "/login"}
        backLabel={signedIn === true ? "Security" : "Sign in"}
      />

      <SettingsSection
        title="What to do"
        description={
          signedIn
            ? "You’re signed in. Open chats to use unlock or reset from the PIN screen."
            : "Sign in first. Use account password recovery if you can’t reach your inbox."
        }
      >
        <SettingsGroup>
          {signedIn === null ? (
            <div className="px-4 py-6 text-sm text-muted-foreground sm:px-5">Checking session…</div>
          ) : signedIn ? (
            <SettingsRowLink
              href="/chat"
              icon={MessageCircle}
              title="Open inbox"
              description="Continue to the app — unlock screen has “Forgot device PIN?”."
            />
          ) : (
            <>
              <SettingsRowLink
                href="/login"
                icon={LogIn}
                title="Sign in"
                description="Use your email and account password."
              />
              <SettingsRowLink
                href="/forgot-password"
                icon={Mail}
                title="Forgot account password"
                description="Reset link via email — different from device PIN."
              />
            </>
          )}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="About the PIN" description="Short reference — same as in Security settings.">
        <SettingsGroup>
          <SettingsRowLink
            href="/settings/security"
            icon={KeyRound}
            iconMuted
            title="Security settings"
            description="PIN, devices, and privacy check."
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/chat/auth-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSupabase } from "@/components/providers/supabase-provider";
import { cn } from "@/lib/utils";

export default function RecoverDevicePage() {
  const supabase = useSupabase();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, [supabase]);

  return (
    <AuthShell subtitle="Your device PIN protects local message keys — not your email password.">
      <Card className="w-full max-w-md border-border/60 bg-card/85 shadow-xl backdrop-blur-xl">
        <CardHeader className="space-y-2 px-8 pb-2 pt-8">
          <CardTitle className="text-2xl font-semibold tracking-tight">Device access</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            Forgot your <strong>device PIN</strong>? Open the app — on the unlock screen, use &quot;Forgot device PIN?&quot; to reset this
            browser or try recovery when it&apos;s available. Old messages may not decrypt without the original keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-8 pb-8">
          {signedIn === null ? (
            <p className="text-sm text-muted-foreground">Checking session…</p>
          ) : signedIn ? (
            <>
              <p className="text-sm text-muted-foreground">
                You&apos;re signed in. Go to <strong>Chats</strong> — the unlock flow offers reset and recovery options.
              </p>
              <Link
                href="/chat"
                className={cn(buttonVariants({ variant: "default" }), "h-11 w-full rounded-xl px-4 text-center")}
              >
                Open inbox
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Sign in to your account first. If you forgot your account password, reset it below.</p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: "secondary" }), "h-11 rounded-xl px-4 text-center")}
                >
                  Sign in
                </Link>
                <Link
                  href="/forgot-password"
                  className={cn(buttonVariants({ variant: "outline" }), "h-11 rounded-xl px-4 text-center")}
                >
                  Forgot account password
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}

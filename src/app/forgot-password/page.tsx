"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthShell } from "@/components/chat/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabase } from "@/components/providers/supabase-provider";

const schema = z.object({ email: z.string().email() });

type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const supabase = useSupabase();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: Values) {
    setBusy(true);
    const origin = window.location.origin;
    await supabase.auth.resetPasswordForEmail(values.email.trim(), {
      redirectTo: `${origin}/reset-password`,
    });
    setBusy(false);
    setDone(true);
  }

  return (
    <AuthShell subtitle="We’ll email a secure link if this address has an account.">
      <Card className="w-full max-w-md border-border/60 bg-card/85 shadow-xl backdrop-blur-xl">
        <CardHeader className="space-y-2 px-8 pb-2 pt-8">
          <CardTitle className="text-2xl font-semibold tracking-tight">Forgot password</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            Same response every time — no hints about whether an account exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-8 pb-8">
          {done ? (
            <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              If an account exists, we&apos;ll send a recovery link. Check your inbox and spam folder.
            </p>
          ) : (
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" className="h-11 rounded-xl" {...form.register("email")} />
                {form.formState.errors.email ? (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                ) : null}
              </div>
              <Button className="h-11 w-full rounded-xl font-medium" type="submit" disabled={busy}>
                Send reset link
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/login">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

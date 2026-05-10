"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { AuthShell } from "@/components/chat/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabase } from "@/components/providers/supabase-provider";

const schema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters."),
    confirm: z.string().min(10),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords must match." });

type Values = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const supabase = useSupabase();
  const router = useRouter();
  const [sessionReady, setSessionReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    if (!hash) {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) setSessionReady(true);
      });
      return;
    }
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (access_token && refresh_token) {
      void supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        if (error) {
          toast.error("This reset link is invalid or expired.");
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        setSessionReady(true);
      });
    }
  }, [supabase]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: Values) {
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated.");
    router.replace("/chat");
    router.refresh();
  }

  return (
    <AuthShell subtitle="Choose a new account password — this is not your device PIN.">
      <Card className="w-full max-w-md border-border/60 bg-card/85 shadow-xl backdrop-blur-xl">
        <CardHeader className="space-y-2 px-8 pb-2 pt-8">
          <CardTitle className="text-2xl font-semibold tracking-tight">New password</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            After saving, sign in with this password. Your device PIN for messages is separate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-8 pb-8">
          {!sessionReady ? (
            <p className="text-sm text-muted-foreground">Opening your recovery session…</p>
          ) : (
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="pw">New password</Label>
                <Input
                  id="pw"
                  type="password"
                  autoComplete="new-password"
                  className="h-11 rounded-xl"
                  {...form.register("password")}
                />
                {form.formState.errors.password ? (
                  <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirm</Label>
                <Input
                  id="pw2"
                  type="password"
                  autoComplete="new-password"
                  className="h-11 rounded-xl"
                  {...form.register("confirm")}
                />
                {form.formState.errors.confirm ? (
                  <p className="text-sm text-destructive">{form.formState.errors.confirm.message}</p>
                ) : null}
              </div>
              <Button className="h-11 w-full rounded-xl font-medium" type="submit" disabled={busy}>
                Update password
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/login">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

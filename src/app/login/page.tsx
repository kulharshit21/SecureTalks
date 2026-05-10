"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { AuthShell } from "@/components/chat/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSupabase } from "@/components/providers/supabase-provider";

const passwordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const magicSchema = z.object({
  email: z.string().email(),
});

type PasswordValues = z.infer<typeof passwordSchema>;
type MagicValues = z.infer<typeof magicSchema>;

export default function LoginPage() {
  const supabase = useSupabase();
  const router = useRouter();

  const [errorCode] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("error");
  });

  const errorText = useMemo(() => {
    if (!errorCode) return null;
    if (errorCode === "missing_code") return "Missing authentication code.";
    if (errorCode === "exchange") return "Unable to complete email link sign-in.";
    if (errorCode === "server_config") return "Server configuration error.";
    return "Sign-in failed.";
  }, [errorCode]);

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: "", password: "" },
  });

  const magicForm = useForm<MagicValues>({
    resolver: zodResolver(magicSchema),
    defaultValues: { email: "" },
  });

  const [busy, setBusy] = useState(false);

  async function onPassword(values: PasswordValues) {
    setBusy(true);
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    setBusy(false);
    if (signErr) {
      passwordForm.setError("root", { message: signErr.message });
      return;
    }
    router.replace("/chat");
    router.refresh();
  }

  async function onMagic(values: MagicValues) {
    setBusy(true);
    const origin = window.location.origin;
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/chat`,
      },
    });
    setBusy(false);
    if (otpErr) {
      magicForm.setError("root", { message: otpErr.message });
      return;
    }
    toast.success("Magic link sent — check your inbox.");
  }

  return (
    <AuthShell subtitle="Sign in to sync ciphertext — keys unlock separately on this device.">
      <Card className="w-full max-w-md border-border/60 bg-card/85 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-500">
        <CardHeader className="space-y-2 px-8 pb-2 pt-8">
          <CardTitle className="text-2xl font-semibold tracking-tight">Welcome back</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            Credentials stay with Supabase Auth. Message bodies remain ciphertext on the wire.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-8 pb-8">
          {errorText ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errorText}
            </p>
          ) : null}

          <Tabs defaultValue="password">
            <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/50 p-1">
              <TabsTrigger value="password" className="rounded-lg text-xs font-medium">
                Email & password
              </TabsTrigger>
              <TabsTrigger value="magic" className="rounded-lg text-xs font-medium">
                Magic link
              </TabsTrigger>
            </TabsList>

            <TabsContent value="password" className="space-y-4 pt-4">
              <form className="space-y-4" onSubmit={passwordForm.handleSubmit(onPassword)}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" className="h-11 rounded-xl" {...passwordForm.register("email")} />
                  {passwordForm.formState.errors.email ? (
                    <p className="text-sm text-destructive">{passwordForm.formState.errors.email.message}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    className="h-11 rounded-xl"
                    {...passwordForm.register("password")}
                  />
                  {passwordForm.formState.errors.password ? (
                    <p className="text-sm text-destructive">{passwordForm.formState.errors.password.message}</p>
                  ) : null}
                </div>

                {passwordForm.formState.errors.root ? (
                  <p className="text-sm text-muted-foreground">{passwordForm.formState.errors.root.message}</p>
                ) : null}

                <Button className="h-11 w-full rounded-xl font-medium" type="submit" disabled={busy}>
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="magic" className="space-y-4 pt-4">
              <form className="space-y-4" onSubmit={magicForm.handleSubmit(onMagic)}>
                <div className="space-y-2">
                  <Label htmlFor="magic-email">Email</Label>
                  <Input id="magic-email" type="email" autoComplete="email" className="h-11 rounded-xl" {...magicForm.register("email")} />
                  {magicForm.formState.errors.email ? (
                    <p className="text-sm text-destructive">{magicForm.formState.errors.email.message}</p>
                  ) : null}
                </div>

                {magicForm.formState.errors.root ? (
                  <p className="text-sm text-muted-foreground">{magicForm.formState.errors.root.message}</p>
                ) : null}

                <Button className="h-11 w-full rounded-xl font-medium" type="submit" variant="secondary" disabled={busy}>
                  Email me a link
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/signup">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

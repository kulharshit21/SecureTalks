"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, and underscores only."),
  displayName: z.string().min(2).max(48),
});

type SignupValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const supabase = useSupabase();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      username: "",
      displayName: "",
    },
  });

  async function onSubmit(values: SignupValues) {
    setBusy(true);
    const origin = window.location.origin;
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/chat`,
        data: {
          username: values.username,
          display_name: values.displayName,
        },
      },
    });
    setBusy(false);

    if (error) {
      form.setError("root", { message: error.message });
      return;
    }

    toast.success("Check your inbox to confirm your email (if confirmations are enabled).");
    router.replace("/chat");
    router.refresh();
  }

  return (
    <AuthShell subtitle="Choose a username friends can search — you’ll secure this device inside the app.">
      <Card className="w-full max-w-md border-border/60 bg-card/85 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-500">
        <CardHeader className="space-y-2 px-8 pb-2 pt-8">
          <CardTitle className="text-2xl font-semibold tracking-tight">Choose your username</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            This is how others find you. After sign-up you&apos;ll name this device and generate encryption keys locally.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" autoComplete="name" className="h-11 rounded-xl" {...form.register("displayName")} />
              {form.formState.errors.displayName ? (
                <p className="text-sm text-destructive">{form.formState.errors.displayName.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" autoComplete="username" className="h-11 rounded-xl" {...form.register("username")} />
              {form.formState.errors.username ? (
                <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" className="h-11 rounded-xl" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                className="h-11 rounded-xl"
                {...form.register("password")}
              />
              {form.formState.errors.password ? (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>

            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}

            <Button className="h-11 w-full rounded-xl font-medium" type="submit" disabled={busy}>
              Continue
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already registered?{" "}
              <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/login">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

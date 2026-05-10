import Link from "next/link";
import { Shield } from "lucide-react";

import { APP_NAME } from "@/lib/brand";

export function AuthShell(props: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="relative flex min-h-screen flex-col justify-center bg-gradient-to-b from-background via-background to-muted/20 px-4 py-16 animate-in fade-in duration-500">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent)]" />
      <div className="relative mx-auto w-full max-w-md space-y-8">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-xl text-foreground transition-opacity hover:opacity-85"
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
              <Shield className="size-[22px]" aria-hidden />
            </span>
            <span className="text-xl font-semibold tracking-tight">{APP_NAME}</span>
          </Link>
          {props.subtitle ? <p className="mt-4 text-sm text-muted-foreground">{props.subtitle}</p> : null}
        </div>
        {props.children}
      </div>
    </div>
  );
}

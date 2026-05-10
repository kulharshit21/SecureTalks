import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Fingerprint, Lock, Shield } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_100%,color-mix(in_oklab,var(--muted-foreground)_10%,transparent),transparent_45%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-8 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
            <Shield className="size-[22px]" aria-hidden />
          </div>
          <span className="text-lg font-semibold tracking-tight">CipherSafe</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-xl text-muted-foreground")}>
            Sign in
          </Link>
          <Link href="/signup" className={cn(buttonVariants({ size: "sm" }), "rounded-xl px-4 shadow-sm")}>
            Get started
            <ArrowRight className="ml-1.5 size-4 opacity-90" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-6 pb-28 pt-6 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:px-8 lg:pb-32 lg:pt-4">
        <section className="max-w-xl animate-in fade-in slide-in-from-bottom-3 duration-700 lg:max-w-[540px]">
          <p className="mb-8 inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Fingerprint className="size-3.5 opacity-80" aria-hidden />
            Privacy-first architecture
          </p>
          <h1 className="text-balance text-[2.35rem] font-semibold leading-[1.08] tracking-tight text-foreground md:text-5xl lg:text-[3.25rem]">
            Private by design.
            <span className="mt-2 block text-muted-foreground md:mt-3">Encrypted before it leaves your device.</span>
          </h1>
          <p className="mt-8 max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
            A calm messenger for people who assume networks are hostile. Keys stay local; the cloud only ever sees opaque envelopes.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-2xl px-8 text-base shadow-md")}>
              Open CipherSafe
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 rounded-2xl border-border/80 px-8 text-base")}
            >
              Sign in
            </Link>
          </div>
          <div className="mt-16 grid gap-4 sm:grid-cols-3">
            <Feature icon={Lock} title="Local keys" body="Wrapped with your device PIN in IndexedDB — never uploaded." />
            <Feature icon={Shield} title="Minimal exposure" body="Server-blind message storage with membership-aware access." />
            <Feature icon={Fingerprint} title="Verifiable" body="Safety numbers you can compare out-of-band when it matters." />
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-[420px] lg:mx-0 lg:max-w-[440px] animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 fill-mode-backwards">
          <div className="rounded-[32px] border border-border/60 bg-card/80 p-8 shadow-2xl shadow-black/[0.06] ring-1 ring-black/[0.03] backdrop-blur-xl dark:bg-card/50 dark:shadow-black/40 dark:ring-white/[0.06]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">What leaves this browser</p>
            <div className="mt-8 space-y-3">
              <GlassRow label="Plaintext on sync layer" value="Never" emphasize />
              <GlassRow label="Private keys in Postgres" value="Never" emphasize />
              <GlassRow label="Opaque ciphertext envelopes" value="Yes" subtle />
            </div>
            <p className="mt-8 border-t border-border/50 pt-6 text-xs leading-relaxed text-muted-foreground">
              CipherSafe is intentionally restrained: fewer surfaces, clearer guarantees. Phase&nbsp;1 prioritizes end-to-end envelopes and
              tenant-safe sync — not feature overload.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function Feature(props: { icon: LucideIcon; title: string; body: string }) {
  const Icon = props.icon;
  return (
    <div className="rounded-2xl border border-border/50 bg-muted/15 p-5 transition-colors hover:bg-muted/25">
      <Icon className="size-[18px] text-foreground/80" strokeWidth={1.75} aria-hidden />
      <p className="mt-4 text-sm font-semibold tracking-tight">{props.title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{props.body}</p>
    </div>
  );
}

function GlassRow(props: { label: string; value: string; emphasize?: boolean; subtle?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/40 bg-background/50 px-4 py-3.5 dark:bg-background/20">
      <span className="text-sm text-muted-foreground">{props.label}</span>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
          props.emphasize && "text-emerald-600 dark:text-emerald-400",
          props.subtle && "text-foreground/85",
        )}
      >
        {props.value}
      </span>
    </div>
  );
}

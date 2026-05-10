import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BellOff,
  ChevronRight,
  Fingerprint,
  Lock,
  MessageSquare,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Mesh + grid — Rev-style dashboard aesthetic */}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_55%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_55%,transparent)_1px,transparent_1px)] bg-size-[64px_64px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_65%_at_50%_-18%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_58%),radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_50%),radial-gradient(ellipse_50%_40%_at_0%_100%,color-mix(in_oklab,var(--muted-foreground)_9%,transparent),transparent_48%)]"
        aria-hidden
      />

      <header className="sticky top-0 z-50 border-b border-transparent bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 lg:h-[4.25rem] lg:px-8">
          <Link href="/" className="group flex items-center gap-3 transition-opacity hover:opacity-90">
            <div className="relative flex size-10 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg shadow-foreground/15 ring-1 ring-foreground/10">
              <Shield className="size-[22px]" aria-hidden />
              <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" aria-hidden />
            </div>
            <div className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight">CipherSafe</span>
              <span className="hidden text-[11px] font-medium text-muted-foreground sm:block">Client-side encryption</span>
            </div>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "rounded-xl text-muted-foreground hover:text-foreground",
              )}
            >
              Sign in
            </Link>
            <Link href="/signup" className={cn(buttonVariants({ size: "sm" }), "rounded-xl px-4 shadow-md shadow-primary/20")}>
              Get started
              <ArrowRight className="ml-1 size-4 opacity-90" aria-hidden />
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 lg:px-8 lg:pb-24 lg:pt-14">
          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)] lg:gap-12 xl:gap-16">
            <div className="max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-700 lg:max-w-none">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-gradient-to-r from-primary/[0.07] via-accent/80 to-primary/[0.07] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/90 shadow-sm backdrop-blur-sm">
                <Sparkles className="size-3.5 text-primary" aria-hidden />
                Zero-trust messaging
              </div>

              <h1 className="text-balance font-heading text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-[3.5rem] xl:text-[3.75rem]">
                Messages only your{" "}
                <span className="relative whitespace-nowrap">
                  <span className="relative z-[1] bg-gradient-to-r from-foreground via-primary to-foreground/80 bg-clip-text text-transparent">
                    devices
                  </span>
                  <span className="absolute -inset-x-1 -bottom-1 z-0 h-3 rounded-full bg-gradient-to-r from-primary/30 via-primary/12 to-transparent blur-md" aria-hidden />
                </span>{" "}
                can read.
              </h1>

              <p className="mt-7 max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl md:leading-relaxed">
                End-to-end envelopes on every send. Supabase stores ciphertext and public keys only — plaintext unlocks on your device after you
                enter your local passphrase.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-12 gap-2 rounded-2xl px-8 text-base shadow-lg shadow-primary/25 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/20",
                  )}
                >
                  Start messaging
                  <ChevronRight className="size-4 opacity-90" aria-hidden />
                </Link>
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-12 rounded-2xl border-border/80 bg-background/50 px-8 text-base backdrop-blur-sm",
                  )}
                >
                  I have an account
                </Link>
              </div>

              <dl className="mt-12 grid gap-3 sm:grid-cols-3">
                <HeroMetric value="E2EE" label="Envelope per message" />
                <HeroMetric value="RLS" label="Row-level isolation" />
                <HeroMetric value="Private" label="Attachment bucket" />
              </dl>
            </div>

            {/* Product preview — Signal / Slack-adjacent composition */}
            <div className="relative mx-auto w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-5 duration-700 delay-150 fill-mode-backwards lg:mx-0 lg:max-w-none">
              <div className="absolute -left-8 top-1/2 hidden h-[70%] w-[70%] -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/12 via-transparent to-transparent blur-3xl xl:block" aria-hidden />
              <div className="relative rounded-[2rem] border border-border/60 bg-card/60 p-2 shadow-[0_32px_120px_-24px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.04] backdrop-blur-2xl dark:bg-card/40 dark:shadow-[0_32px_120px_-24px_rgba(0,0,0,0.65)] dark:ring-white/[0.06]">
                <div className="overflow-hidden rounded-[1.55rem] border border-border/40 bg-gradient-to-b from-muted/40 to-background/90">
                  <div className="flex items-center gap-3 border-b border-border/50 bg-muted/20 px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="size-2.5 rounded-full bg-red-400/90" />
                      <span className="size-2.5 rounded-full bg-amber-400/90" />
                      <span className="size-2.5 rounded-full bg-emerald-400/90" />
                    </div>
                    <span className="flex-1 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      CipherSafe · encrypted thread
                    </span>
                    <Lock className="size-3.5 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="space-y-4 p-4 pb-6">
                    <PreviewBubble align="left" label="Peer · ciphertext" />
                    <PreviewBubble align="right" label="You · opaque envelope" />
                    <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-2.5 text-center text-[11px] font-medium text-muted-foreground">
                      Server sees blobs — not your words.
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 px-1 pb-1">
                  <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2.5 text-[11px] text-muted-foreground backdrop-blur-sm">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">sync</span>
                    <p className="mt-1 font-medium text-foreground">Realtime receipts</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2.5 text-[11px] text-muted-foreground backdrop-blur-sm">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-foreground/70">vault</span>
                    <p className="mt-1 font-medium text-foreground">Keys in IndexedDB</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bento — dashboard-style feature blocks */}
        <section className="border-t border-border/50 bg-muted/[0.35] py-16 lg:py-24">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Designed like a security product, not a toy demo.</h2>
              <p className="mt-4 text-muted-foreground md:text-lg">
                Borrowing patterns from serious messengers and SaaS control planes — minimal chrome, explicit guarantees.
              </p>
            </div>

            <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
              <BentoCard
                className="md:col-span-2 lg:col-span-2"
                icon={Shield}
                title="Server-blind storage"
                description="Postgres rows carry ciphertext, nonces, and membership metadata. No plaintext_body column; no automatic AI on private threads."
                footer="Supabase RLS + private attachment bucket"
              />
              <BentoCard
                icon={Fingerprint}
                title="Verify identities"
                description="Compare safety numbers out-of-band when you need confidence — same habit as Signal-style messengers."
              />
              <BentoCard
                icon={Lock}
                title="Local crypto vault"
                description="Private keys stay wrapped in your browser storage. Unlock with your device passphrase; nothing equivalent ships to the API."
              />
              <BentoCard
                icon={BellOff}
                title="Opt-in intelligence"
                description="Mistral runs only when you explicitly invoke rewrite or analysis — never as a silent listener on normal sends."
              />
              <BentoCard
                icon={Zap}
                title="Realtime without leaking content"
                description="Channels carry encrypted payloads and presence signals. Durable history stays ciphertext in the database."
              />
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
          <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-foreground/[0.03] via-background to-primary/[0.06] p-10 shadow-xl md:p-14">
            <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/10 blur-3xl" aria-hidden />
            <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <div className="flex items-center gap-2 text-primary">
                  <MessageSquare className="size-5" aria-hidden />
                  <span className="text-sm font-semibold uppercase tracking-wide">Ready when you are</span>
                </div>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">Open your inbox in under a minute.</h3>
                <p className="mt-3 text-muted-foreground">
                  Create an account, register this device&apos;s keys, and start a direct chat — all without trusting the sync layer with plaintext.
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-2xl px-8 shadow-lg")}>
                  Create account
                </Link>
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-12 rounded-2xl px-8")}
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-border/50 py-10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 text-sm text-muted-foreground md:flex-row lg:px-8">
            <p className="text-center md:text-left">CipherSafe — privacy-first encrypted messenger prototype.</p>
            <div className="flex flex-wrap items-center justify-center gap-6">
              <Link href="/login" className="transition-colors hover:text-foreground">
                Sign in
              </Link>
              <Link href="/signup" className="transition-colors hover:text-foreground">
                Sign up
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function HeroMetric(props: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border/55 bg-background/60 px-4 py-3 shadow-sm backdrop-blur-sm">
      <dt className="font-mono text-lg font-semibold tracking-tight text-foreground">{props.value}</dt>
      <dd className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{props.label}</dd>
    </div>
  );
}

function PreviewBubble(props: { align: "left" | "right"; label: string }) {
  const isRight = props.align === "right";
  return (
    <div className={cn("flex", isRight ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug shadow-sm",
          isRight
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-border/60 bg-muted/50 text-foreground",
        )}
      >
        <p className="font-medium">{props.label}</p>
        <p className={cn("mt-1 font-mono text-[10px] tracking-wide", isRight ? "text-primary-foreground/75" : "text-muted-foreground")}>
          U2FsdGVkX1… + nonce
        </p>
      </div>
    </div>
  );
}

function BentoCard(props: {
  icon: LucideIcon;
  title: string;
  description: string;
  footer?: string;
  className?: string;
}) {
  const Icon = props.icon;
  return (
    <div
      className={cn(
        "group flex flex-col rounded-[1.35rem] border border-border/60 bg-card/70 p-6 shadow-sm transition-[border-color,box-shadow] hover:border-primary/25 hover:shadow-md md:p-7 dark:bg-card/50",
        props.className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-colors group-hover:bg-primary/15">
        <Icon className="size-[22px]" strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-tight">{props.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{props.description}</p>
      {props.footer ? (
        <p className="mt-4 border-t border-border/50 pt-4 font-mono text-[11px] text-muted-foreground">{props.footer}</p>
      ) : null}
    </div>
  );
}

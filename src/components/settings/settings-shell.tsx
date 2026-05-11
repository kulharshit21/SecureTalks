import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Full-page shell: gradient, centered column (Telegram / system settings rhythm). */
export function SettingsShell(props: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative min-h-[100dvh]", props.className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_45%_at_50%_-15%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)]" />
      <div className="relative mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">{props.children}</div>
    </div>
  );
}

export function SettingsPageHeader(props: {
  title: string;
  description?: string;
  backHref: string;
  backLabel?: string;
}) {
  const back = props.backLabel ?? "Back";
  return (
    <header className="mb-8 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={props.backHref}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 gap-1 rounded-xl text-muted-foreground hover:text-foreground",
          )}
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="text-xs font-medium sm:text-sm">{back}</span>
        </Link>
      </div>
      <div>
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{props.title}</h1>
        {props.description ? (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{props.description}</p>
        ) : null}
      </div>
    </header>
  );
}

/** Uppercase section label + optional hint above a group. */
export function SettingsSection(props: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", props.className)}>
      <div className="px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground/90">{props.description}</p>
        ) : null}
      </div>
      {props.children}
    </section>
  );
}

/** One bordered card; use `divide-y` for stacked rows. */
export function SettingsGroup(props: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/50 shadow-sm backdrop-blur-[2px] dark:bg-card/30",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

function RowIconSlot(props: { icon: LucideIcon; muted?: boolean }) {
  const Icon = props.icon;
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        props.muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

/** Tappable row → route (chevron on the right). */
export function SettingsRowLink(props: {
  href: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconMuted?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={props.href}
      className={cn(
        "flex min-h-[3.5rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 active:bg-muted/55 sm:px-5",
        props.className,
      )}
    >
      {props.icon ? <RowIconSlot icon={props.icon} muted={props.iconMuted} /> : null}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-medium text-foreground">{props.title}</span>
        {props.description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{props.description}</span>
        ) : null}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground/70" aria-hidden />
    </Link>
  );
}

/** Non-navigation row (e.g. disabled, or wraps custom trailing control). */
export function SettingsRow(props: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconMuted?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[3.5rem] items-center gap-3 px-4 py-3 sm:px-5",
        props.className,
      )}
    >
      {props.icon ? <RowIconSlot icon={props.icon} muted={props.iconMuted} /> : null}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-medium text-foreground">{props.title}</span>
        {props.description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{props.description}</span>
        ) : null}
      </span>
      {props.trailing ? <span className="shrink-0">{props.trailing}</span> : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { MessageCircle, Shield } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const MotionLink = motion.create(Link);

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.06 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 380, damping: 28 },
  },
};

export default function ChatHomePage() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative flex h-full min-h-[min(72vh,580px)] flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-5%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_55%)]" />
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 h-[min(50%,420px)] w-[min(100%,720px)] -translate-x-1/2 rounded-[100%] bg-primary/[0.07] blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col justify-center px-5 py-12 md:px-10 md:py-16">
        <motion.div
          className="mx-auto w-full max-w-xl [perspective:1400px]"
          initial="hidden"
          animate="show"
          variants={containerVariants}
        >
          <div className="space-y-10 text-center">
            <motion.div className="space-y-4" variants={itemVariants}>
              <h1 className="text-balance font-sans font-semibold tracking-tight text-foreground text-[1.75rem] leading-[1.15] md:text-4xl md:leading-[1.1]">
                Your private inbox starts here.
              </h1>
              <p className="text-pretty text-base leading-relaxed text-muted-foreground md:text-lg md:leading-relaxed">
                Start a conversation. Messages are encrypted before they sync.
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              <HeroActionCard
                icon={MessageCircle}
                title="Start a chat"
                description="Find a contact and send your first private message."
                hint="Use “New chat” in the sidebar (or tap Inbox on your phone)."
                reduceMotion={reduceMotion}
              />
              <HeroActionCard
                icon={Shield}
                title="Run privacy check"
                description="Confirm your device, storage, and recovery settings."
                href="/security"
                reduceMotion={reduceMotion}
              />
            </motion.div>

            <motion.p className="text-sm text-muted-foreground" variants={itemVariants}>
              <Link
                href="/"
                className="font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                How {APP_NAME} protects your chats
              </Link>
            </motion.p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function HeroActionCard(props: {
  icon: LucideIcon;
  title: string;
  description: string;
  href?: string;
  hint?: string;
  reduceMotion: boolean | null;
}) {
  const Icon = props.icon;
  const baseClass = cn(
    "group flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/55 p-6 text-left shadow-[0_4px_24px_-8px_rgb(0_0_0/0.35)] backdrop-blur-md dark:shadow-[0_8px_32px_-10px_rgb(0_0_0/0.55)]",
    "transition-[border-color,background-color] duration-200",
    "hover:border-primary/35 hover:bg-card/80",
  );

  const hover3d = props.reduceMotion
    ? {}
    : {
        y: -6,
        rotateX: 4,
        scale: 1.02,
        boxShadow:
          "0 24px 48px -12px color-mix(in oklab, var(--primary) 22%, transparent), 0 12px 24px -14px rgb(0 0 0 / 0.45)",
      };

  const tap = props.reduceMotion ? {} : { scale: 0.99, rotateX: 0 };

  const inner = (
    <>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20 transition-colors group-hover:bg-primary/18">
        <Icon className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
      </div>
      <div>
        <p className="text-sm font-semibold tracking-tight text-foreground">{props.title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{props.description}</p>
        {props.hint ? <p className="mt-3 text-xs font-medium text-primary">{props.hint}</p> : null}
      </div>
    </>
  );

  if (props.href) {
    return (
      <MotionLink
        href={props.href}
        className={baseClass}
        style={{ transformStyle: "preserve-3d", transformOrigin: "center bottom" }}
        whileHover={hover3d}
        whileTap={tap}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
      >
        {inner}
      </MotionLink>
    );
  }

  return (
    <motion.div
      className={baseClass}
      style={{ transformStyle: "preserve-3d", transformOrigin: "center bottom" }}
      whileHover={hover3d}
      whileTap={tap}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
    >
      {inner}
    </motion.div>
  );
}

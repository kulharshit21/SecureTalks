"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ChatHomePage() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center animate-in fade-in duration-500">
        <div className="mx-auto max-w-md rounded-[28px] border border-border/60 bg-card/50 px-10 py-14 shadow-sm backdrop-blur-sm">
          <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
            <Inbox className="size-7 text-primary" strokeWidth={1.5} aria-hidden />
          </div>
          <p className="text-lg font-semibold tracking-tight">No conversation selected</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Choose a chat from the inbox on the left. On your phone, tap <strong>Inbox</strong> in the bar below.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-11 rounded-xl px-6")}
            >
              About CipherSafe
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function DevSmokeTestPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Manual smoke checklist</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Development-only page — no seed data, no mock messages. Use two real accounts in separate browsers.
      </p>
      <ol className="mt-8 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
        <li>Open User A in Chrome (or one profile).</li>
        <li>Open User B in another browser or incognito profile.</li>
        <li>Complete onboarding and device key setup for both.</li>
        <li>User A: search User B by username, start a direct chat.</li>
        <li>Send a text message from A; confirm B receives and decrypts.</li>
        <li>In Supabase (SQL or Table Editor): confirm latest message row has ciphertext + nonce only — no plaintext fields.</li>
        <li>Send an attachment; confirm encrypted path under private storage.</li>
        <li>Try optional AI draft rewrite after consent — normal send must not call AI.</li>
        <li>Open Privacy check (/security) and review diagnostics.</li>
      </ol>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/chat" className={cn(buttonVariants({ size: "sm" }), "rounded-xl")}>
          Open inbox
        </Link>
        <Link href="/security" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-xl")}>
          Privacy check
        </Link>
      </div>
    </div>
  );
}

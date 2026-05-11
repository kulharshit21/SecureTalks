"use client";

import { Shield } from "lucide-react";

import { PrivacyPanelContent } from "@/components/chat/privacy-panel-content";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function PrivacyPanelSheet(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60 px-6 py-5 text-left">
          <SheetTitle className="font-semibold tracking-tight">Privacy & security</SheetTitle>
          <SheetDescription className="text-xs leading-relaxed">
            What this app exposes to infrastructure versus what stays on your hardware.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <PrivacyPanelContent />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function PrivacyPanelTrigger(props: { onClick: () => void; className?: string; collapsed?: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      size={props.collapsed ? "icon-lg" : "sm"}
      className={cn("rounded-xl border-border/60", props.className)}
      onClick={props.onClick}
      aria-label="Open privacy panel"
    >
      <Shield className="size-4" aria-hidden />
      {!props.collapsed ? <span className="ml-2">Privacy</span> : null}
    </Button>
  );
}

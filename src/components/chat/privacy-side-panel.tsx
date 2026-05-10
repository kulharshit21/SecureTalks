"use client";

import { PrivacyPanelContent } from "@/components/chat/privacy-panel-content";

export function PrivacySidePanel(props: { userId: string }) {
  return (
    <div className="flex h-full w-full flex-col border-l border-border/50 bg-sidebar/30">
      <div className="border-b border-border/50 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Privacy</p>
        <p className="mt-1 text-sm font-medium tracking-tight">Protection overview</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <PrivacyPanelContent userId={props.userId} />
      </div>
    </div>
  );
}

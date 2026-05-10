"use client";

import { Sparkles } from "lucide-react";

export function AiFeaturesBanner() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p>
        <span className="font-medium text-foreground">AI features are opt-in.</span> Private messages are never analyzed
        automatically. Rewrite, summarize, report analysis, and smart reply send only what you confirm through our servers to an
        external AI — outside your private chat boundary — same caution as pasting into any web assistant.
      </p>
    </div>
  );
}

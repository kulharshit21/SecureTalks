"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AiConsentDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
  title?: string;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{props.title ?? "Opt-in AI assistant"}</DialogTitle>
          <DialogDescription className="space-y-3 text-left text-xs leading-relaxed">
            <span className="block font-medium text-foreground">
              AI features are optional. Private messages are never analyzed automatically.
            </span>
            <span className="block">
              When you use Rewrite, Summarize, Report analysis, or Smart reply, only the text you explicitly confirm is sent —
              first to this app&apos;s server, then to Mistral. That step is <strong>outside</strong> the end-to-end encrypted
              chat boundary (same risk class as pasting into an external assistant). Normal Send stays encrypted client-side and
              does not touch Mistral.
            </span>
            <span className="block text-muted-foreground">See docs/AI_PRIVACY.md for the full policy.</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-xl"
            onClick={() => {
              props.onAccept();
              props.onOpenChange(false);
            }}
          >
            I understand — enable AI actions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";

import { AiConsentDialog } from "@/components/chat/ai-consent-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callMistralProxy } from "@/lib/ai/client";
import { setAiConsentAccepted } from "@/lib/ai/consent-storage";

function AiSummarizeExportMounted(props: {
  initialExportText: string;
  hasConsent: boolean;
  onConsentGranted: () => void;
  onRequestClose: () => void;
}) {
  const [consentOpen, setConsentOpen] = useState(false);
  const [draft, setDraft] = useState(props.initialExportText);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function runSummarize() {
    if (!props.hasConsent) {
      setConsentOpen(true);
      return;
    }
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      toast.error("Nothing to summarize.");
      return;
    }
    setBusy(true);
    try {
      const out = await callMistralProxy({ purpose: "summarize_export", payload: trimmed });
      if ("error" in out) {
        toast.error(out.error);
        return;
      }
      setResult(out.text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AiConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        title="Consent before summarizing"
        onAccept={() => {
          setAiConsentAccepted();
          props.onConsentGranted();
        }}
      />
      <DialogContent className="max-h-[min(90vh,720px)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/60 px-6 py-4 text-left">
          <DialogTitle>Summarize selected export</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Only the text below is sent to Mistral after you confirm. Edit or remove lines before running.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[42vh] space-y-2 overflow-y-auto px-6 py-4">
          <Label htmlFor="export-snippet" className="text-xs text-muted-foreground">
            Exported excerpt
          </Label>
          <Textarea
            id="export-snippet"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[160px] resize-y rounded-xl font-mono text-xs"
          />
        </div>
        {result ? (
          <div className="border-t border-border/60 bg-muted/15 px-6 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Summary</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{result}</p>
          </div>
        ) : null}
        <DialogFooter className="border-t border-border/60 bg-muted/10 px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={() => props.onRequestClose()}>
            Close
          </Button>
          <Button type="button" size="sm" className="rounded-xl" disabled={busy} onClick={() => void runSummarize()}>
            {busy ? "Working…" : "Send to Mistral & summarize"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </>
  );
}

export function AiSummarizeExportDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bump whenever the dialog opens so draft state remounts from fresh props. */
  mountEpoch: number;
  initialExportText: string;
  hasConsent: boolean;
  onConsentGranted: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? (
        <AiSummarizeExportMounted
          key={props.mountEpoch}
          initialExportText={props.initialExportText}
          hasConsent={props.hasConsent}
          onConsentGranted={props.onConsentGranted}
          onRequestClose={() => props.onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function AiReportAnalysisMounted(props: {
  reportedSnippet: string;
  hasConsent: boolean;
  onConsentGranted: () => void;
  onRequestClose: () => void;
}) {
  const [consentOpen, setConsentOpen] = useState(false);
  const [draft, setDraft] = useState(props.reportedSnippet);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function runAnalysis() {
    if (!props.hasConsent) {
      setConsentOpen(true);
      return;
    }
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    try {
      const out = await callMistralProxy({ purpose: "report_analysis", payload: trimmed });
      if ("error" in out) {
        toast.error(out.error);
        return;
      }
      setResult(out.text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AiConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        title="Consent before report analysis"
        onAccept={() => {
          setAiConsentAccepted();
          props.onConsentGranted();
        }}
      />
      <DialogContent className="max-h-[min(90vh,640px)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/60 px-6 py-4 text-left">
          <DialogTitle>Report analysis (AI-assisted)</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Only the message you confirm below is sent to Mistral for triage guidance. This does not notify a human moderator
            automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 px-6 py-4">
          <Label className="text-xs text-muted-foreground">Reported content</Label>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[120px] resize-y rounded-xl text-sm"
          />
        </div>
        {result ? (
          <div className="border-t border-border/60 bg-muted/15 px-6 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Analysis</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{result}</p>
          </div>
        ) : null}
        <DialogFooter className="border-t border-border/60 bg-muted/10 px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={() => props.onRequestClose()}>
            Close
          </Button>
          <Button type="button" size="sm" className="rounded-xl" disabled={busy} onClick={() => void runAnalysis()}>
            {busy ? "Working…" : "Confirm & analyze with Mistral"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </>
  );
}

export function AiReportAnalysisDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mountEpoch: number;
  reportedSnippet: string;
  hasConsent: boolean;
  onConsentGranted: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? (
        <AiReportAnalysisMounted
          key={props.mountEpoch}
          reportedSnippet={props.reportedSnippet}
          hasConsent={props.hasConsent}
          onConsentGranted={props.onConsentGranted}
          onRequestClose={() => props.onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

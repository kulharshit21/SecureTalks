import type { AiAction, AiSummarizeVariant } from "@/lib/ai/types";

export function systemPromptForAction(action: AiAction, variant?: AiSummarizeVariant): string {
  switch (action) {
    case "rewrite_draft":
      return [
        "You rewrite user drafts for clarity and tone.",
        "Preserve intent. Do not add facts or names the user did not write.",
        "Output only the rewritten message text, no preamble.",
      ].join(" ");
    case "summarize_selected":
      if (variant === "reply_suggestion") {
        return [
          "The user pasted an excerpt of peer messages they can already see locally.",
          "Suggest exactly one short reply they could send (max ~2 sentences).",
          "Neutral-friendly tone unless context obviously needs otherwise.",
          "Output only the suggested reply text — no quotes, labels, or preamble.",
        ].join(" ");
      }
      return [
        "You summarize an excerpt the user explicitly selected or exported from their chat.",
        "Use short bullets. Do not infer missing context.",
        "No preamble.",
      ].join(" ");
    case "analyze_reported":
      return [
        "You help triage a single reported message for abuse/harassment.",
        "Respond with: (1) severity low/medium/high/unclear, (2) one-line rationale, (3) suggested action for a human moderator.",
        "Do not repeat slurs verbatim if avoidable; describe categories instead.",
      ].join(" ");
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

import type { AiPurpose } from "@/lib/ai/types";

export function systemPromptForPurpose(purpose: AiPurpose): string {
  switch (purpose) {
    case "rewrite_draft":
      return [
        "You rewrite user drafts for clarity and tone.",
        "Preserve intent. Do not add facts or names the user did not write.",
        "Output only the rewritten message text, no preamble.",
      ].join(" ");
    case "summarize_export":
      return [
        "You summarize an excerpt the user explicitly exported from their chat.",
        "Use short bullets. Do not infer missing context.",
        "No preamble.",
      ].join(" ");
    case "report_analysis":
      return [
        "You help triage a single reported message for abuse/harassment.",
        "Respond with: (1) severity low/medium/high/unclear, (2) one-line rationale, (3) suggested action for a human moderator.",
        "Do not repeat slurs verbatim if avoidable; describe categories instead.",
      ].join(" ");
    case "smart_reply_context":
      return [
        "You suggest one short reply based only on the quoted peer messages.",
        "Match a neutral-friendly tone unless context demands otherwise.",
        "Output only the suggested reply text, no quotes or labels.",
      ].join(" ");
    default: {
      const _exhaustive: never = purpose;
      return _exhaustive;
    }
  }
}

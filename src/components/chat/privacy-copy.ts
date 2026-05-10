/** Plain-language security overview snippets (Overview tab only). Technical terms belong in Advanced / Diagnostics. */
export const PRIVACY_OVERVIEW_COPY = {
  cards: [
    { title: "Private by default", body: "Your messages are locked before they leave this device." },
    { title: "Only you hold the keys", body: "Your private keys stay on your device." },
    { title: "We can’t read your chats", body: "Privyra stores encrypted data, not readable messages." },
    { title: "AI is opt-in", body: "Draft help only runs when you choose it." },
  ],
  footer:
    "Verified contacts help prevent impersonation. For technical checks, open the Diagnostics tab.",
} as const;

export function extractOverviewPlainText(): string {
  return [...PRIVACY_OVERVIEW_COPY.cards.map((c) => `${c.title} ${c.body}`), PRIVACY_OVERVIEW_COPY.footer].join(" ");
}

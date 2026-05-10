export type ExpiryChoiceId = "off" | "30s" | "5m" | "1h" | "24h";

export const EXPIRY_CHOICES: ReadonlyArray<{ id: ExpiryChoiceId; label: string; ttlMs: number | null }> = [
  { id: "off", label: "Off", ttlMs: null },
  { id: "30s", label: "30 seconds", ttlMs: 30_000 },
  { id: "5m", label: "5 minutes", ttlMs: 5 * 60_000 },
  { id: "1h", label: "1 hour", ttlMs: 60 * 60_000 },
  { id: "24h", label: "24 hours", ttlMs: 24 * 60 * 60_000 },
];

/** ISO timestamp when the message should expire, or null if persistent. */
export function expiresAtIsoFromTtlMs(ttlMs: number | null, nowMs: number): string | null {
  if (ttlMs === null || ttlMs <= 0) return null;
  return new Date(nowMs + ttlMs).toISOString();
}

export function isMessageExpired(expiresAtIso: string | null | undefined, now: Date): boolean {
  if (!expiresAtIso) return false;
  const t = Date.parse(expiresAtIso);
  if (!Number.isFinite(t)) return false;
  return now.getTime() >= t;
}

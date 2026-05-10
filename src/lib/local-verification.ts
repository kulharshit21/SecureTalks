const STORAGE_KEY = "ciphersafe_verified_peers_v1";

function readMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeMap(m: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
}

export function isPeerVerifiedLocally(peerUserId: string): boolean {
  return Boolean(readMap()[peerUserId]);
}

export function setPeerVerifiedLocally(peerUserId: string, verified: boolean): void {
  const m = readMap();
  if (verified) m[peerUserId] = true;
  else delete m[peerUserId];
  writeMap(m);
}

/**
 * Fixed-window rate limiter (in-memory). Suitable for single-node / dev.
 * For multi-instance production, replace with Redis or edge KV.
 */
type Bucket = { windowStartMs: number; count: number };

const buckets = new Map<string, Bucket>();

export function checkAiRateLimit(params: {
  key: string;
  windowMs: number;
  maxInWindow: number;
  nowMs?: number;
}): boolean {
  const now = params.nowMs ?? Date.now();
  const prev = buckets.get(params.key);

  if (!prev || now - prev.windowStartMs >= params.windowMs) {
    buckets.set(params.key, { windowStartMs: now, count: 1 });
    return true;
  }

  if (prev.count >= params.maxInWindow) {
    return false;
  }

  prev.count += 1;
  return true;
}

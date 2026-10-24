const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit = 6, windowMs = 10 * 60_000): RateLimitResult {
  const now = Date.now();
  const existing = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (existing.length >= limit) {
    const oldest = existing[0] ?? now;
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }
  existing.push(now);
  buckets.set(key, existing);

  if (buckets.size > 5_000) {
    for (const [bucketKey, timestamps] of buckets) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) buckets.delete(bucketKey);
    }
  }

  return { ok: true, retryAfterSeconds: 0 };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "local";
}

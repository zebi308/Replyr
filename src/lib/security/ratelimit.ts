// In-memory sliding window. Fine for one instance; swap for Redis/Upstash when running multiple instances.
const hits = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 20000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return true;
}
export const clientIp = (req: Request) => (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim();

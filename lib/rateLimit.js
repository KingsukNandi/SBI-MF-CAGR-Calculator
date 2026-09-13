/**
 * Fixed-window rate limiter held in process memory.
 *
 * On serverless this counts PER INSTANCE, so with N warm instances the
 * effective ceiling is roughly N times the configured limit. That makes it a
 * speed bump against a naive loop, not a real defence. It is deliberate: the
 * alternative is an external store (Upstash Redis or similar), which is ~20
 * lines but adds a dependency and a key to manage. Revisit if this ever sees
 * real traffic and do not describe it as protection in the meantime.
 */
const WINDOW_MS = 60 * 1000;
const LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 30);

const hits = new Map();

// Bound the map so a spray of unique IPs cannot grow it without limit.
const MAX_TRACKED_CLIENTS = 10000;

export const rateLimit = (key) => {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    if (hits.size >= MAX_TRACKED_CLIENTS) {
      for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
      if (hits.size >= MAX_TRACKED_CLIENTS) hits.clear();
    }
    const resetAt = now + WINDOW_MS;
    hits.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: LIMIT - 1, resetAt };
  }

  entry.count += 1;
  return {
    allowed: entry.count <= LIMIT,
    remaining: Math.max(0, LIMIT - entry.count),
    resetAt: entry.resetAt,
  };
};

/** Best-effort client identity behind Vercel's proxy. */
export const clientKey = (request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
};

export const RATE_LIMIT = LIMIT;

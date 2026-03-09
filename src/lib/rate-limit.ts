/**
 * 🛡️ Rate Limiter
 *
 * Production : Upstash Redis (sliding window, multi-instance safe).
 * Dev / fallback : in-memory Map (si UPSTASH_REDIS_REST_URL absent).
 *
 * Configurer UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN dans .env.local
 * pour activer Redis en développement.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Fallback in-memory (dev sans Upstash) ──────────────────────────────────

interface Entry {
  count: number;
  firstAt: number;
}
const store = new Map<string, Entry>();

function inMemoryLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.firstAt > windowMs) {
    store.set(key, { count: 1, firstAt: now });
    return { success: true, reset: now + windowMs };
  }
  if (entry.count >= limit) {
    return { success: false, reset: entry.firstAt + windowMs };
  }
  entry.count++;
  return { success: true, reset: entry.firstAt + windowMs };
}

// ── Upstash Redis (production) ─────────────────────────────────────────────

const useRedis = !!(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
);

const redis = useRedis ? Redis.fromEnv() : null;

const authLimiter = useRedis
  ? new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(10, "15 m"),
      prefix: "rl:auth",
    })
  : null;

const apiLimiter = useRedis
  ? new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "rl:api",
    })
  : null;

// ── Interface commune ──────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean;
  /** Timestamp (ms) auquel la fenêtre se réinitialise */
  reset: number;
}

export async function checkAuthRateLimit(ip: string): Promise<RateLimitResult> {
  if (authLimiter) {
    const { success, reset } = await authLimiter.limit(ip);
    return { success, reset };
  }
  return inMemoryLimit(`auth:${ip}`, 10, 15 * 60 * 1000);
}

export async function checkApiRateLimit(ip: string): Promise<RateLimitResult> {
  if (apiLimiter) {
    const { success, reset } = await apiLimiter.limit(ip);
    return { success, reset };
  }
  return inMemoryLimit(`api:${ip}`, 60, 60 * 1000);
}

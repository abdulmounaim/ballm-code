import type { Cache } from "@ballm/platform/cache"

export interface LimitResult {
  readonly allowed: boolean
  readonly limit: number
  readonly remaining: number
  readonly retryAfter: number
}

/**
 * Fixed-window limiter. It is intentionally simple: Redis INCR is atomic and cheap, and the
 * window is short enough that fairness is adequate for an internal developer platform.
 */
export async function take(
  cache: Cache,
  key: string,
  limit: number,
  windowSeconds = 60,
): Promise<LimitResult> {
  const count = await cache.incr(key, windowSeconds)
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfter: windowSeconds,
  }
}

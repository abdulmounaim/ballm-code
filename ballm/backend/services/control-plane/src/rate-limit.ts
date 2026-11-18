import type { Context } from "hono"
import { clientIp, retryAfter } from "@ballm/platform/http"
import type { Deps } from "./deps"

export async function rateLimit(
  c: Context<{ Variables: import("./deps").Variables }>,
  deps: Deps,
  scope: string,
  limit: number,
  windowSeconds = 60,
) {
  const ip = clientIp(c, deps.env.BALLM_TRUST_PROXY) ?? "unknown"
  const key = `ballm:rl:${scope}:${ip}`
  const count = await deps.cache.incr(key, windowSeconds)
  c.header("x-ratelimit-limit", String(limit))
  c.header("x-ratelimit-remaining", String(Math.max(0, limit - count)))
  if (count <= limit) return
  deps.metrics.rateLimited(scope)
  return c.json(
    { error: "too_many_requests", message: "Too many requests; retry later" },
    429,
    retryAfter(windowSeconds),
  )
}

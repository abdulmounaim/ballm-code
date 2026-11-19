import type { Context, Hono } from "hono"
import type { Deps } from "../deps"
import { rateLimit } from "../rate-limit"

const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"])

/**
 * Keeps the identity UI on the console origin. Proxying Kratos instead of calling it cross-origin
 * means its session cookie is first-party and the console CSP needs no third-party `connect-src`.
 */
export function kratosProxyRoutes(app: Hono<{ Variables: import("../deps").Variables }>, deps: Deps) {
  const base = deps.env.BALLM_KRATOS_PUBLIC_URL
  if (!base) return
  const target = base.replace(/\/+$/, "")

  app.all("/self-service/*", async (c) => {
    if (c.req.method === "POST" && /\/(registration|recovery|settings|verification)$/.test(new URL(c.req.url).pathname)) {
      const limited = await rateLimit(c, deps, "identity.write", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE)
      if (limited) return limited
    }
    return proxy(c, deps, target)
  })

  app.all("/sessions/*", (c) => proxy(c, deps, target))
}

async function proxy(
  c: Context<{ Variables: import("../deps").Variables }>,
  deps: Deps,
  target: string,
) {
  const requestUrl = new URL(c.req.url)
  const headers = new Headers(c.req.raw.headers)
  headers.delete("host")
  headers.delete("content-length")
  headers.set("x-forwarded-host", requestUrl.host)
  headers.set("x-forwarded-proto", requestUrl.protocol.replace(":", ""))
  const client = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip")
  if (client) headers.set("x-forwarded-for", client)

  let response: Response
  try {
    response = await fetch(`${target}${requestUrl.pathname}${requestUrl.search}`, {
      method: c.req.method,
      headers,
      body: c.req.method === "GET" || c.req.method === "HEAD" ? undefined : await c.req.arrayBuffer(),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    deps.logger.warn("identity proxy failed", {
      path: requestUrl.pathname,
      error: error instanceof Error ? error.message : String(error),
    })
    return c.json({ error: "identity_unavailable", message: "The identity service is unreachable" }, 502)
  }

  const out = new Headers()
  response.headers.forEach((value, key) => {
    if (key === "content-encoding" || key === "content-length" || HOP_BY_HOP.has(key)) return
    if (key === "set-cookie") return
    out.append(key, value)
  })
  for (const cookie of response.headers.getSetCookie()) out.append("set-cookie", cookie)
  return new Response(response.body, { status: response.status, headers: out })
}

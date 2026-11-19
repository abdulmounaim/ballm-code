import type { Hono } from "hono"
import type { Deps } from "../deps"

/**
 * Single-domain deployments put the gateway behind the control plane. The gateway still owns
 * inference, rate limits, and usage; this only forwards `/v1/*` and streams the response back.
 *
 * `BALLM_GATEWAY_INTERNAL_URL` is an internal service address such as `http://ballm-gateway:8788`.
 * When it is not set, the gateway must be exposed on its own public URL instead.
 */
export function gatewayProxyRoutes(app: Hono<{ Variables: import("../deps").Variables }>, deps: Deps) {
  app.all("/v1/*", async (c) => {
    const target = deps.env.BALLM_GATEWAY_INTERNAL_URL
    if (!target) {
      return c.json(
        {
          error: {
            type: "server_error",
            message: "No internal gateway is configured for /v1 on this deployment",
          },
        },
        503,
      )
    }

    const url = new URL(c.req.url)
    const upstream = new URL(target.replace(/\/+$/, "") + url.pathname + url.search)

    const headers = new Headers(c.req.raw.headers)
    for (const name of [
      "host",
      "content-length",
      "connection",
      "keep-alive",
      "transfer-encoding",
      "upgrade",
      "proxy-authorization",
      "proxy-authenticate",
      "te",
      "trailer",
    ])
      headers.delete(name)

    const method = c.req.method
    const body = method === "GET" || method === "HEAD" ? undefined : await c.req.arrayBuffer()

    try {
      const response = await fetch(upstream, { method, headers, body, redirect: "manual" })
      const responseHeaders = new Headers(response.headers)
      for (const name of ["content-encoding", "content-length", "transfer-encoding", "connection"])
        responseHeaders.delete(name)
      return new Response(response.body, { status: response.status, headers: responseHeaders })
    } catch {
      return c.json(
        {
          error: {
            type: "upstream_error",
            message: "The model gateway could not be reached",
          },
        },
        502,
      )
    }
  })
}

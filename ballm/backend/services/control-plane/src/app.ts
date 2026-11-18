import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { apiError } from "@ballm/platform/http"
import type { Deps } from "./deps"
import { adminRoutes } from "./routes/admin"
import { configRoutes } from "./routes/config"
import { consoleRoutes } from "./routes/console"
import { deviceRoutes } from "./routes/device"
import { directoryRoutes } from "./routes/directory"
import { healthRoutes } from "./routes/health"
import { jwksRoutes } from "./routes/jwks"
import { ssoRoutes } from "./routes/sso"
import { applySecurityHeaders, consoleStaticRoutes } from "./static"

export function createApp(deps: Deps) {
  const app = new Hono<{ Variables: import("./deps").Variables }>()

  app.use("*", async (c, next) => {
    const id = c.req.header("x-request-id") ?? randomUUID()
    c.set("requestId", id)
    c.header("x-request-id", id)
    applySecurityHeaders(c, deps)
    if (c.req.path.startsWith("/api/console/")) c.header("cache-control", "no-store")
    const logger = deps.logger.child({ requestId: id })
    c.set("logger", logger)
    const started = performance.now()
    await next()
    const durationSeconds = (performance.now() - started) / 1000
    deps.metrics.observeHttp({
      method: c.req.method,
      route: c.req.routePath || c.req.path,
      status: c.res.status,
      durationSeconds,
    })
    logger.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(durationSeconds * 1000),
    })
  })

  app.onError((error, c) => {
    const mapped = apiError(error)
    c.set("logger", c.get("logger") ?? deps.logger)
    if (mapped.status >= 500) {
      deps.logger.error("request failed", {
        requestId: c.get("requestId"),
        path: c.req.path,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
    return c.json(mapped.body, mapped.status as 400)
  })

  app.notFound((c) => c.json({ error: "not_found", message: "Route not found" }, 404))

  app.route("/", healthRoutes(deps))
  app.route("/", jwksRoutes(deps))
  app.route("/", deviceRoutes(deps))
  app.route("/", ssoRoutes(deps))
  app.route("/", directoryRoutes(deps))
  app.route("/", configRoutes(deps))
  app.route("/", adminRoutes(deps))
  app.route("/", consoleRoutes(deps))
  consoleStaticRoutes(app, deps)

  app.get("/", (c) =>
    c.json({
      service: "ballm-control-plane",
      region: deps.env.BALLM_REGION,
      console: "/console",
      docs: "/.well-known/jwks.json",
    }),
  )

  return app
}

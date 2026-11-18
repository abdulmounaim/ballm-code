import { Hono } from "hono"
import { ping } from "@ballm/platform/db"
import type { App, Deps } from "../deps"

export function healthRoutes(deps: Deps) {
  const app = new Hono<{ Variables: import("../deps").Variables }>()

  app.get("/health", (c) => c.json({ ok: true, service: "control-plane", region: deps.env.BALLM_REGION }))

  app.get("/ready", async (c) => {
    const [database, cache] = await Promise.allSettled([ping(deps.db.write), deps.cache.ping()])
    const ready = database.status === "fulfilled" && cache.status === "fulfilled"
    return c.json(
      {
        ok: ready,
        database: database.status,
        cache: cache.status,
        cache_kind: deps.cache.kind,
      },
      ready ? 200 : 503,
    )
  })

  app.get("/metrics", async (c) => {
    c.header("content-type", deps.metrics.contentType)
    return c.body(await deps.metrics.render())
  })

  return app satisfies App
}

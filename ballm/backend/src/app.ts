import { Hono } from "hono"
import { deviceRoutes } from "./auth/device.js"
import { configRoutes } from "./config/route.js"
import { directoryRoutes } from "./directory/routes.js"
import type { ServerConfig } from "./env.js"
import { gatewayRoutes } from "./gateway/proxy.js"
import type { DB } from "./store/db.js"

export function createApp(db: DB, config: ServerConfig) {
  const app = new Hono()
  app.get("/health", (c) => c.json({ ok: true }))
  app.route("/", deviceRoutes(db, config))
  app.route("/", directoryRoutes(db))
  app.route("/", configRoutes(db, config))
  app.route("/", gatewayRoutes(db, config))
  return app
}

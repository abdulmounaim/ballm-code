import { Hono } from "hono"
import type { App, Deps } from "../deps"

export function jwksRoutes(deps: Deps) {
  const app = new Hono<{ Variables: import("../deps").Variables }>()

  app.get("/.well-known/jwks.json", (c) => {
    c.header("cache-control", "public, max-age=300")
    return c.json({ keys: [deps.keys.jwk] })
  })

  return app satisfies App
}

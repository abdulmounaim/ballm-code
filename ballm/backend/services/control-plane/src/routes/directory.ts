import { Hono } from "hono"
import type { App, Deps } from "../deps"
import { accessAuth, claims } from "../auth"
import { orgsForUser } from "../store"

export function directoryRoutes(deps: Deps) {
  const app = new Hono<{ Variables: import("../deps").Variables }>()

  app.use("/api/user", accessAuth(deps))
  app.use("/api/orgs", accessAuth(deps))

  app.get("/api/user", async (c) => {
    const user = await deps.db.write<{ id: string; email: string; name: string | null }[]>`
      SELECT id, email, name FROM users WHERE id = ${claims(c).sub} LIMIT 1
    `
    if (!user[0]) return c.json({ error: "unauthorized", message: "User no longer exists" }, 401)
    return c.json(user[0])
  })

  app.get("/api/orgs", async (c) => {
    return c.json(await orgsForUser(deps.db.write, claims(c).sub))
  })

  return app satisfies App
}

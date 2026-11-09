import { Hono } from "hono"
import type { DB } from "../store/db.js"
import { authenticate } from "../auth/token.js"

export function directoryRoutes(db: DB) {
  const app = new Hono()

  app.get("/api/user", (c) => {
    const session = authenticate(c, db)
    if (!session) return c.json({ error: "unauthorized" }, 401)
    const user = db
      .query<{ id: string; email: string }, [string]>("SELECT id, email FROM users WHERE id = ?")
      .get(session.user_id)
    if (!user) return c.json({ error: "unauthorized" }, 401)
    return c.json(user)
  })

  app.get("/api/orgs", (c) => {
    const session = authenticate(c, db)
    if (!session) return c.json({ error: "unauthorized" }, 401)
    const orgs = db
      .query<
        { id: string; name: string },
        [string]
      >("SELECT orgs.id, orgs.name FROM orgs JOIN memberships ON memberships.org_id = orgs.id WHERE memberships.user_id = ? ORDER BY orgs.name")
      .all(session.user_id)
    return c.json(orgs)
  })

  return app
}

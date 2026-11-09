import { Hono } from "hono"
import { authenticate } from "../auth/token.js"
import type { ServerConfig } from "../env.js"
import type { DB } from "../store/db.js"
import { audit } from "../store/repository.js"
import { policies } from "./policy.js"

export function configRoutes(db: DB, config: ServerConfig) {
  const app = new Hono()

  app.get("/api/v2/config", (c) => {
    const session = authenticate(c, db)
    if (!session) return c.json({ error: "unauthorized" }, 401)
    const org = c.req.header("x-org-id")
    if (org && org !== session.org_id) return c.json({ error: "forbidden" }, 403)
    audit(db, { kind: "config.read", userId: session.user_id, orgId: session.org_id })
    return c.json({
      providers: {
        ballm: {
          name: "Ballm",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: `${config.publicUrl}/v1` },
          models: Object.fromEntries(
            config.models.map((model) => [
              model.id,
              {
                name: model.name,
                limit: { context: 200_000, output: 32_000 },
              },
            ]),
          ),
        },
      },
      mcp: { servers: {} },
      policies: policies(),
    })
  })

  return app
}

import { Hono } from "hono"
import type { App, Deps } from "../deps"
import { accessAuth, claims } from "../auth"
import { audit, defaultPolicies, getOrgConfig, membership } from "../store"

export function configRoutes(deps: Deps) {
  const app = new Hono<{ Variables: import("../deps").Variables }>()

  app.use("/api/v2/config", accessAuth(deps))

  app.get("/api/v2/config", async (c) => {
    const current = claims(c)
    const requested = c.req.header("x-org-id") ?? current.org
    if (requested !== current.org) {
      const allowed = await membership(deps.db.write, current.sub, requested)
      if (!allowed) return c.json({ error: "forbidden", message: "No membership in this organization" }, 403)
    }

    const config = await getOrgConfig(deps.db.write, requested)
    if (config.models.length === 0)
      return c.json({ error: "not_found", message: "No models are enabled for this organization" }, 404)

    await audit(deps.db.write, {
      kind: "config.read",
      orgId: requested,
      userId: current.sub,
      sessionId: current.sid,
    })

    c.header("cache-control", "no-store")
    return c.json({
      providers: {
        ballm: {
          name: "Ballm",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: `${deps.env.BALLM_GATEWAY_PUBLIC_URL.replace(/\/+$/, "")}/v1` },
          models: Object.fromEntries(
            config.models.map((model) => [
              model.id,
              {
                name: model.name,
                ...(model.context_limit || model.output_limit
                  ? {
                      limit: {
                        ...(model.context_limit ? { context: model.context_limit } : {}),
                        ...(model.output_limit ? { output: model.output_limit } : {}),
                      },
                    }
                  : {}),
              },
            ]),
          ),
        },
      },
      mcp: { servers: {} },
      policies:
        Array.isArray(config.policies) && config.policies.length > 0 ? config.policies : defaultPolicies(),
    })
  })

  return app satisfies App
}

import { Hono } from "hono"
import { signAccessToken } from "@ballm/platform/auth"
import type { App, Deps } from "../deps"
import { rateLimit } from "../rate-limit"
import { audit, claimDeviceCode, createDeviceCode, revokeRefreshToken, revokeSession, rotateRefreshToken } from "../store"

export function deviceRoutes(deps: Deps) {
  const app = new Hono<{ Variables: import("../deps").Variables }>()

  app.post("/auth/device/code", async (c) => {
    const limited = await rateLimit(c, deps, "device.code", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE)
    if (limited) return limited
    const body = await c.req.json().catch(() => ({}))
    const clientId = typeof body.client_id === "string" ? body.client_id : "ballm-cli"
    const device = await createDeviceCode(deps.db.write, clientId)
    return c.json({
      device_code: device.deviceCode,
      user_code: device.userCode,
      verification_uri_complete: `${deps.env.BALLM_PUBLIC_URL}/console/device?user_code=${encodeURIComponent(device.userCode)}`,
      expires_in: device.expiresIn,
      interval: device.interval,
    })
  })

  app.post("/auth/device/token", async (c) => {
    const limited = await rateLimit(c, deps, "device.token", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE * 4)
    if (limited) return limited
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

    if (body.grant_type === "refresh_token") {
      if (typeof body.refresh_token !== "string") return c.json({ error: "invalid_grant" }, 400)
      const result = await rotateRefreshToken(deps.db.write, body.refresh_token, deps.env.BALLM_REFRESH_TTL)
      if (result.kind === "invalid") return c.json({ error: "invalid_grant" }, 400)
      if (result.kind === "reused") {
        await audit(deps.db.write, { kind: "auth.refresh_reuse", detail: { sessionId: result.sessionId } })
        return c.json({ error: "invalid_grant" }, 400)
      }
      const access = await signAccessToken(deps.keys, {
        userId: result.userId,
        orgId: result.orgId,
        sessionId: result.sessionId,
        ttl: deps.env.BALLM_ACCESS_TTL,
      })
      return c.json({
        access_token: access,
        refresh_token: result.refresh,
        expires_in: deps.env.BALLM_ACCESS_TTL,
        org_id: result.orgId,
      })
    }

    if (body.grant_type !== "urn:ietf:params:oauth:grant-type:device_code")
      return c.json({ error: "unsupported_grant_type" }, 400)
    if (typeof body.device_code !== "string") return c.json({ error: "invalid_grant" }, 400)

    const result = await claimDeviceCode(deps.db.write, body.device_code, deps.env.BALLM_REFRESH_TTL)
    if (result.status !== "approved") return c.json({ error: result.status }, 400)

    const access = await signAccessToken(deps.keys, {
      userId: result.userId,
      orgId: result.orgId,
      sessionId: result.sessionId,
      ttl: deps.env.BALLM_ACCESS_TTL,
    })
    return c.json({
      access_token: access,
      refresh_token: result.refresh,
      expires_in: deps.env.BALLM_ACCESS_TTL,
      org_id: result.orgId,
    })
  })

  app.post("/auth/device/revoke", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    if (typeof body.token === "string") {
      const sessionId = await revokeRefreshToken(deps.db.write, body.token)
      if (sessionId) await deps.cache.set(`ballm:revoked:${sessionId}`, "1", deps.env.BALLM_ACCESS_TTL)
      if (!sessionId) {
        try {
          const claims = await deps.keys.verify(body.token)
          await revokeSession(deps.db.write, claims.sid)
          await deps.cache.set(`ballm:revoked:${claims.sid}`, "1", deps.env.BALLM_ACCESS_TTL)
        } catch {
          // Unknown tokens are idempotent.
        }
      }
    }
    return c.json({ ok: true })
  })

  /**
   * The old server-rendered approval page is gone. Keep the well-known URL working so links that
   * are already printed in a terminal keep resolving.
   */
  app.get("/device", (c) => {
    const code = c.req.query("user_code")
    return c.redirect(`/console/device${code ? `?user_code=${encodeURIComponent(code)}` : ""}`, 302)
  })

  app.get("/device/success", (c) => {
    const code = c.req.query("user_code")
    return c.redirect(`/console/device/success${code ? `?user_code=${encodeURIComponent(code)}` : ""}`, 302)
  })

  return app satisfies App
}

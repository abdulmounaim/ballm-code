import { Hono } from "hono"
import type { Context } from "hono"
import type { ServerConfig } from "../env.js"
import type { DB } from "../store/db.js"
import {
  approveDeviceCode,
  claimDeviceCode,
  createDeviceCode,
  issueTokens,
  revokeToken,
  rotateRefreshToken,
} from "../store/repository.js"

export function deviceRoutes(db: DB, config: ServerConfig) {
  const app = new Hono()

  app.post("/auth/device/code", async (c) => {
    const body = await json(c)
    const clientID = typeof body.client_id === "string" ? body.client_id : "ballm-cli"
    const device = createDeviceCode(db, clientID)
    return c.json({
      device_code: device.deviceCode,
      user_code: device.userCode,
      verification_uri_complete: `${config.publicUrl}/device?user_code=${encodeURIComponent(device.userCode)}`,
      expires_in: device.expiresIn,
      interval: device.interval,
    })
  })

  app.post("/auth/device/token", async (c) => {
    const body = await json(c)
    if (body.grant_type === "refresh_token") {
      if (typeof body.refresh_token !== "string") return c.json({ error: "invalid_grant" }, 400)
      const rotated = rotateRefreshToken(db, body.refresh_token, config)
      if (!rotated) return c.json({ error: "invalid_grant" }, 400)
      return c.json({
        access_token: rotated.access,
        refresh_token: rotated.refresh,
        expires_in: rotated.expiresIn,
        org_id: rotated.orgID,
      })
    }
    if (body.grant_type !== "urn:ietf:params:oauth:grant-type:device_code") {
      return c.json({ error: "unsupported_grant_type" }, 400)
    }
    if (typeof body.device_code !== "string") return c.json({ error: "invalid_grant" }, 400)
    const claimed = claimDeviceCode(db, body.device_code)
    if (claimed.status !== "approved") return c.json({ error: claimed.status }, 400)
    const issued = issueTokens(db, claimed.userID, claimed.orgID, config)
    return c.json({
      access_token: issued.access,
      refresh_token: issued.refresh,
      expires_in: issued.expiresIn,
      org_id: claimed.orgID,
    })
  })

  app.post("/auth/device/approve", async (c) => {
    if (!config.allowDevApprove) return c.json({ error: "not_found" }, 404)
    const body = await json(c)
    if (typeof body.user_code !== "string") return c.json({ error: "invalid_request" }, 400)
    const email = typeof body.email === "string" && body.email.length > 0 ? body.email : "dev@ballm.internal"
    const result = approveDeviceCode(db, body.user_code, email, config)
    if (!result.ok) return c.json({ error: result.error }, 400)
    return c.json({ ok: true, email: result.email, org: result.org })
  })

  app.post("/auth/device/revoke", async (c) => {
    const body = await json(c)
    if (typeof body.token === "string") revokeToken(db, body.token)
    return c.json({ ok: true })
  })

  app.get("/device", (c) => c.html(approvalPage(c.req.query("user_code") ?? "", undefined)))

  app.post("/device", async (c) => {
    const form = await c.req.parseBody()
    const userCode = typeof form.user_code === "string" ? form.user_code : ""
    const email = typeof form.email === "string" && form.email.length > 0 ? form.email : "dev@ballm.internal"
    const result = approveDeviceCode(db, userCode, email, config)
    if (!result.ok) return c.html(approvalPage(userCode, result.error), 400)
    return c.html(
      `<!doctype html><meta charset="utf-8"><title>Ballm Code</title>
       <main style="font:16px system-ui;max-width:32rem;margin:4rem auto">
         <h1>Device approved</h1>
         <p>Signed in as <strong>${escapeHTML(result.email)}</strong> for <strong>${escapeHTML(result.org)}</strong>.</p>
         <p>Return to your terminal.</p>
       </main>`,
    )
  })

  return app
}

function approvalPage(userCode: string, error: string | undefined) {
  return `<!doctype html><meta charset="utf-8"><title>Ballm Code</title>
  <main style="font:16px system-ui;max-width:32rem;margin:4rem auto">
    <h1>Connect Ballm Code</h1>
    <p>Enter the code shown in your terminal and confirm your work email.</p>
    ${error ? `<p style="color:#b00020">Approval failed: ${escapeHTML(error)}</p>` : ""}
    <form method="post" action="/device">
      <p><label>Code<br><input name="user_code" value="${escapeHTML(userCode)}" autocomplete="one-time-code" required
        style="font:inherit;padding:.5rem;width:100%"></label></p>
      <p><label>Email<br><input name="email" type="email" value="dev@ballm.internal" required
        style="font:inherit;padding:.5rem;width:100%"></label></p>
      <p><button type="submit" style="font:inherit;padding:.6rem 1rem">Approve</button></p>
    </form>
    <p style="color:#666">Development mode. Production deployments replace this page with SSO.</p>
  </main>`
}

async function json(c: Context) {
  const value = await c.req.json().catch(() => ({}))
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function escapeHTML(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

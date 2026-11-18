import { Hono } from "hono"
import { randomToken, signAccessToken } from "@ballm/platform/auth"
import { clearCookie, clientIp, readCookie } from "@ballm/platform/http"
import type { App, Deps } from "../deps"
import { rateLimit } from "../rate-limit"
import {
  approveDeviceCode,
  audit,
  browserSession,
  claimDeviceCode,
  createDeviceCode,
  createOidcState,
  createSession,
  deviceByUserCode,
  orgForEmailDomain,
  revokeRefreshToken,
  revokeSession,
  rotateRefreshToken,
  ssoForOrg,
} from "../store"
import { authorizationUrl, pkce } from "../sso/oidc"
import { oidcConnection } from "../sso/connection"

const BROWSER_COOKIE = "ballm_browser"

export function deviceRoutes(deps: Deps) {
  const app = new Hono<{ Variables: import("../deps").Variables }>()
  const secureCookie = () => deps.env.BALLM_PUBLIC_URL.startsWith("https://")

  app.post("/auth/device/code", async (c) => {
    const limited = await rateLimit(c, deps, "device.code", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE)
    if (limited) return limited
    const body = await c.req.json().catch(() => ({}))
    const clientId = typeof body.client_id === "string" ? body.client_id : "ballm-cli"
    const device = await createDeviceCode(deps.db.write, clientId)
    return c.json({
      device_code: device.deviceCode,
      user_code: device.userCode,
      verification_uri_complete: `${deps.env.BALLM_PUBLIC_URL}/device?user_code=${encodeURIComponent(device.userCode)}`,
      expires_in: device.expiresIn,
      interval: device.interval,
    })
  })

  app.post("/auth/device/token", async (c) => {
    const limited = await rateLimit(c, deps, "device.token", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE * 4)
    if (limited) return limited
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>

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
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
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

  app.get("/device", async (c) => {
    const userCode = c.req.query("user_code") ?? ""
    const browser = await browserSession(deps.db.read, readCookie(c, BROWSER_COOKIE))
    if (browser) {
      const [user] = await deps.db.read<{ email: string }[]>`SELECT email FROM users WHERE id = ${browser.user_id}`
      const [org] = await deps.db.read<{ name: string }[]>`SELECT name FROM orgs WHERE id = ${browser.org_id}`
      return c.html(approvalPage(userCode, undefined, { email: user?.email, org: org?.name }))
    }
    return c.html(approvalPage(userCode, undefined))
  })

  app.post("/device", async (c) => {
    const limited = await rateLimit(c, deps, "device.approve", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE)
    if (limited) return limited
    const form = await c.req.parseBody()
    const userCode = typeof form.user_code === "string" ? form.user_code : ""
    const email = typeof form.email === "string" ? form.email.trim().toLowerCase() : ""
    if (!userCode) return c.html(approvalPage("", "Enter the code shown in your terminal"), 400)

    const device = await deviceByUserCode(deps.db.write, userCode)
    if (!device) return c.html(approvalPage(userCode, "Unknown or expired code"), 400)
    if (device.expires_at.getTime() <= Date.now() || device.status !== "pending")
      return c.html(approvalPage(userCode, "This code has expired or was already used"), 400)

    const browser = await browserSession(deps.db.read, readCookie(c, BROWSER_COOKIE))
    if (browser) {
      const sessionId = await createSession(deps.db.write, {
        userId: browser.user_id,
        orgId: browser.org_id,
        method: "device",
        userAgent: c.req.header("user-agent"),
        ip: clientIp(c, deps.env.BALLM_TRUST_PROXY),
      })
      await approveDeviceCode(deps.db.write, {
        deviceHash: device.device_code_hash,
        userId: browser.user_id,
        orgId: browser.org_id,
        sessionId,
      })
      await audit(deps.db.write, {
        kind: "device.approved",
        orgId: browser.org_id,
        userId: browser.user_id,
        sessionId,
        detail: { userCode },
      })
      return c.redirect(`/device/success?user_code=${encodeURIComponent(device.user_code)}`)
    }

    if (!email) return c.html(approvalPage(userCode, "Enter your work email to continue with SSO"), 400)
    const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase()
    const orgs = await orgForEmailDomain(deps.db.read, domain)
    if (orgs.length === 0)
      return c.html(approvalPage(userCode, "No SSO organization is configured for that email domain"), 400)
    const org = orgs[0]!
    const sso = await ssoForOrg(deps.db.read, org.id)
    if (!sso) return c.html(approvalPage(userCode, "SSO is not configured for this organization"), 400)

    const { verifier, challenge } = pkce()
    const nonce = randomToken(16)
    const redirectUri = `${deps.env.BALLM_PUBLIC_URL}/auth/sso/callback`
    const state = await createOidcState(deps.db.write, {
      orgId: org.id,
      nonce,
      codeVerifier: verifier,
      redirectUri,
      deviceCodeHash: device.device_code_hash,
      userCode: device.user_code,
    })
    const url = await authorizationUrl(oidcConnection(sso, deps.secrets), {
      redirectUri,
      state,
      nonce,
      codeChallenge: challenge,
    })
    return c.redirect(url)
  })

  app.get("/device/success", (c) => {
    const code = c.req.query("user_code") ?? ""
    return c.html(`<!doctype html><meta charset="utf-8"><title>Ballm Code</title>
      <main style="font:16px system-ui;max-width:32rem;margin:4rem auto">
        <h1>Device approved</h1>
        <p>${code ? `Code <strong>${escapeHTML(code)}</strong> is approved.` : "The device is approved."} Return to your terminal.</p>
      </main>`)
  })

  app.get("/auth/sso/logout", async (c) => {
    const cookie = readCookie(c, BROWSER_COOKIE)
    const browser = await browserSession(deps.db.write, cookie)
    if (browser) await deps.db.write`UPDATE browser_sessions SET revoked_at = now() WHERE id = ${browser.id}`
    clearCookie(c, BROWSER_COOKIE, secureCookie())
    return c.redirect("/device")
  })

  return app satisfies App
}

function approvalPage(
  userCode: string,
  error: string | undefined,
  signedIn?: { email?: string; org?: string },
) {
  return `<!doctype html><meta charset="utf-8"><title>Connect Ballm Code</title>
  <main style="font:16px system-ui;max-width:32rem;margin:4rem auto">
    <h1>Connect Ballm Code</h1>
    ${signedIn ? `<p>Signed in as <strong>${escapeHTML(signedIn.email ?? "")}</strong> · ${escapeHTML(signedIn.org ?? "")}</p>` : ""}
    ${error ? `<p style="color:#b00020">${escapeHTML(error)}</p>` : ""}
    <form method="post" action="/device">
      <p><label>Code<br><input name="user_code" value="${escapeHTML(userCode)}" autocomplete="one-time-code" required
        style="font:inherit;padding:.5rem;width:100%"></label></p>
      ${signedIn ? "" : `<p><label>Work email<br><input name="email" type="email" required
        style="font:inherit;padding:.5rem;width:100%"></label></p>`}
      <p><button type="submit" style="font:inherit;padding:.6rem 1rem">Approve</button></p>
    </form>
    ${signedIn ? `<p><a href="/auth/sso/logout">Sign out</a></p>` : "<p>Your organization signs you in through its identity provider.</p>"}
  </main>`
}

function escapeHTML(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

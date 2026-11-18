import { Hono } from "hono"
import { randomToken } from "@ballm/platform/auth"
import { clearCookie, clientIp, readCookie, setCookie } from "@ballm/platform/http"
import type { App, Deps } from "../deps"
import { rateLimit } from "../rate-limit"
import {
  approveDeviceCode,
  audit,
  browserSession,
  consumeOidcState,
  createBrowserSession,
  createOidcState,
  createSession,
  ensureMembership,
  findOrCreateUser,
  orgById,
  orgBySlug,
  orgsForUser,
  ssoForOrg,
} from "../store"
import { allowedByDomain, authorizationUrl, exchangeCode, pkce, roleForClaims, verifyIdToken } from "../sso/oidc"
import { oidcConnection } from "../sso/connection"
import { browserCookieName } from "../console/cookies"


export function ssoRoutes(deps: Deps) {
  const app = new Hono<{ Variables: import("../deps").Variables }>()
  const secureCookie = () => deps.env.BALLM_PUBLIC_URL.startsWith("https://")

  app.get("/auth/sso/:slug/start", async (c) => {
    const limited = await rateLimit(c, deps, "sso.start", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE)
    if (limited) return limited
    const org = await orgBySlug(deps.db.write, c.req.param("slug"))
    if (!org) return c.json({ error: "not_found", message: "Unknown organization" }, 404)
    const sso = await ssoForOrg(deps.db.write, org.id)
    if (!sso?.enabled) return c.json({ error: "not_found", message: "SSO is not configured" }, 404)

    const { verifier, challenge } = pkce()
    const nonce = randomToken(16)
    const redirectUri = `${deps.env.BALLM_PUBLIC_URL}/auth/sso/callback`
    const state = await createOidcState(deps.db.write, {
      orgId: org.id,
      nonce,
      codeVerifier: verifier,
      redirectUri,
      deviceCodeHash: c.req.query("device_code_hash") ?? undefined,
      userCode: c.req.query("user_code") ?? undefined,
    })
    const url = await authorizationUrl(oidcConnection(sso, deps.secrets), {
      redirectUri,
      state,
      nonce,
      codeChallenge: challenge,
    })
    return c.redirect(url)
  })

  app.get("/auth/sso/callback", async (c) => {
    const code = c.req.query("code")
    const state = c.req.query("state")
    if (!code || !state) return c.json({ error: "invalid_request", message: "Missing code or state" }, 400)

    const pending = await consumeOidcState(deps.db.write, state)
    if (!pending) return c.json({ error: "invalid_request", message: "State is expired or already used" }, 400)
    const org = await orgById(deps.db.write, pending.org_id)
    const sso = await ssoForOrg(deps.db.write, pending.org_id)
    if (!org || !sso?.enabled) return c.json({ error: "not_found", message: "Organization SSO is unavailable" }, 404)

    const connection = oidcConnection(sso, deps.secrets)
    const token = await exchangeCode(connection, {
      code,
      codeVerifier: pending.code_verifier,
      redirectUri: pending.redirect_uri,
    })
    const claims = await verifyIdToken(connection, token.id_token!, pending.nonce)
    if (!allowedByDomain(connection, claims.email!))
      return c.json({ error: "forbidden", message: "Email domain is not allowed for this organization" }, 403)

    const user = await findOrCreateUser(deps.db.write, {
      email: claims.email!,
      name: typeof claims.name === "string" ? claims.name : undefined,
    })
    await ensureMembership(deps.db.write, user.id, org.id, roleForClaims(connection, claims))

    if (pending.device_code_hash) {
      const sessionId = await createSession(deps.db.write, {
        userId: user.id,
        orgId: org.id,
        method: "sso",
        userAgent: c.req.header("user-agent"),
        ip: clientIp(c, deps.env.BALLM_TRUST_PROXY),
      })
      await approveDeviceCode(deps.db.write, {
        deviceHash: pending.device_code_hash,
        userId: user.id,
        orgId: org.id,
        sessionId,
      })
      await audit(deps.db.write, {
        kind: "device.approved",
        orgId: org.id,
        userId: user.id,
        sessionId,
        detail: { userCode: pending.user_code },
      })
    }

    const browser = await createBrowserSession(deps.db.write, {
      userId: user.id,
      orgId: org.id,
      ttlSeconds: deps.env.BALLM_BROWSER_TTL,
    })
    setCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL), browser.cookie, {
      maxAge: deps.env.BALLM_BROWSER_TTL,
      secure: secureCookie(),
    })
    await audit(deps.db.write, { kind: "auth.sso", orgId: org.id, userId: user.id })

    if (pending.device_code_hash)
      return c.redirect(`/console/device/success?user_code=${encodeURIComponent(pending.user_code ?? "")}`)
    return c.redirect("/console/")
  })

  app.get("/auth/sso/me", async (c) => {
    const browser = await browserSession(deps.db.write, readCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL)))
    if (!browser) return c.json({ error: "unauthorized" }, 401)
    const [user] = await deps.db.write<{ id: string; email: string; name: string | null }[]>`
      SELECT id, email, name FROM users WHERE id = ${browser.user_id} LIMIT 1
    `
    return c.json({ user, orgs: await orgsForUser(deps.db.write, browser.user_id) })
  })

  app.get("/auth/sso/logout", async (c) => {
    const cookie = readCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL))
    const browser = await browserSession(deps.db.write, cookie)
    if (browser) await deps.db.write`UPDATE browser_sessions SET revoked_at = now() WHERE id = ${browser.id}`
    clearCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL), secureCookie())
    return c.redirect("/console/")
  })

  /**
   * Local-only shortcut for tests and developer machines. Disabled unless BALLM_DEV_AUTH=1 and
   * rejected at startup in production.
   */
  app.post("/auth/dev/login", async (c) => {
    if (!deps.env.BALLM_DEV_AUTH) return c.json({ error: "not_found" }, 404)
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const email = typeof body.email === "string" ? body.email : "dev@ballm.internal"
    const slug = typeof body.org === "string" ? body.org : deps.env.BALLM_BOOTSTRAP_ORG_SLUG
    const org = await orgBySlug(deps.db.write, slug)
    if (!org) return c.json({ error: "not_found", message: "Unknown organization" }, 404)
    const user = await findOrCreateUser(deps.db.write, { email })
    await ensureMembership(deps.db.write, user.id, org.id, "owner")
    const browser = await createBrowserSession(deps.db.write, {
      userId: user.id,
      orgId: org.id,
      ttlSeconds: deps.env.BALLM_BROWSER_TTL,
    })
    setCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL), browser.cookie, {
      maxAge: deps.env.BALLM_BROWSER_TTL,
      secure: secureCookie(),
    })

    if (typeof body.user_code === "string") {
      const sessionId = await createSession(deps.db.write, { userId: user.id, orgId: org.id, method: "dev" })
      const device = await deps.db.write<{ device_code_hash: string }[]>`
        SELECT device_code_hash FROM device_codes
        WHERE user_code = ${body.user_code.toUpperCase()} AND status = 'pending' AND expires_at > now()
        LIMIT 1
      `
      if (device[0]) {
        await approveDeviceCode(deps.db.write, {
          deviceHash: device[0].device_code_hash,
          userId: user.id,
          orgId: org.id,
          sessionId,
        })
      }
    }

    return c.json({ user, org })
  })

  return app satisfies App
}

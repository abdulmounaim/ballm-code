import { Hono } from "hono"
import { clientIp, readCookie, setCookie } from "@ballm/platform/http"
import type { App, Deps } from "../deps"
import { rateLimit } from "../rate-limit"
import {
  acceptInvite,
  approveDeviceCode,
  audit,
  browserSession,
  consumeAuthState,
  createAuthState,
  createBrowserSession,
  createSession,
  deviceByUserCode,
  ensurePersonalOrg,
  findOrCreateIdentityUser,
  inviteByToken,
  orgsForUser,
} from "../store"
import { flowUrl, identityName, identitySession, verifiedEmail, type IdentityFlow } from "../identity/kratos"
import { browserCookieName } from "../console/cookies"
import { assertSameOrigin } from "../console/auth"

const KRATOS_SESSION_COOKIE = "ory_kratos_session"

/**
 * Password and passkey sign-in. Ory Kratos owns the credential; this route turns a verified Kratos
 * session into a platform browser session, a personal workspace, and, when the flow started from a
 * terminal, an approved device code.
 */
export function passwordRoutes(deps: Deps) {
  const app = new Hono<{ Variables: import("../deps").Variables }>()
  const enabled = () => Boolean(deps.env.BALLM_KRATOS_PUBLIC_URL)
  const secureCookie = () => deps.env.BALLM_PUBLIC_URL.startsWith("https://")

  app.get("/auth/config", (c) =>
    c.json({
      password: { enabled: enabled() },
      signup: enabled() && deps.env.BALLM_SIGNUP_ENABLED,
      sso: true,
    }),
  )

  /** Starts a hosted identity flow, carrying device approval and invitation context through it. */
  app.get("/auth/password/:mode{login|register|recover|settings|verify}", async (c) => {
    if (!enabled()) return c.json({ error: "not_found", message: "Password sign-in is not configured" }, 404)
    const limited = await rateLimit(c, deps, "password.start", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE)
    if (limited) return limited

    const mode = c.req.param("mode")
    const kind: IdentityFlow | undefined =
      mode === "login"
        ? "login"
        : mode === "register"
          ? "registration"
          : mode === "recover"
            ? "recovery"
            : mode === "settings"
              ? "settings"
              : mode === "verify"
                ? "verification"
                : undefined
    if (!kind) return c.json({ error: "not_found" }, 404)
    if (kind === "registration" && !deps.env.BALLM_SIGNUP_ENABLED)
      return c.json({ error: "signup_disabled", message: "Self-service sign-up is closed" }, 403)

    const userCode = c.req.query("user_code")?.trim()
    const device = userCode ? await deviceByUserCode(deps.db.write, userCode) : undefined
    if (userCode && (!device || device.status !== "pending" || device.expires_at.getTime() <= Date.now()))
      return c.json({ error: "invalid_code", message: "That code is unknown, expired, or already used" }, 400)

    const inviteToken = c.req.query("invite")?.trim()
    const invite = inviteToken ? await inviteByToken(deps.db.write, inviteToken) : undefined
    if (inviteToken && !invite)
      return c.json({ error: "invalid_invite", message: "That invitation is unknown or has expired" }, 400)

    const requested = c.req.query("return_to")
    const returnTo = requested?.startsWith("/console") ? requested : undefined

    const state = await createAuthState(deps.db.write, {
      kind,
      ...(device ? { deviceCodeHash: device.device_code_hash, userCode: device.user_code } : {}),
      ...(invite ? { inviteId: invite.id } : {}),
      ...(returnTo ? { returnTo } : {}),
    })
    return c.redirect(flowUrl(kind, `${deps.env.BALLM_PUBLIC_URL}/auth/password/complete?state=${state}`))
  })

  app.get("/auth/password/complete", async (c) => {
    if (!enabled()) return c.redirect("/console/")
    const limited = await rateLimit(c, deps, "password.complete", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE * 3)
    if (limited) return limited

    const pending = await consumeAuthState(deps.db.write, c.req.query("state") ?? "")
    const identity = await identitySession(deps.env, readCookie(c, KRATOS_SESSION_COOKIE))
    if (!identity) return c.redirect("/console/?auth=expired")

    const email = identity.identity.traits.email?.trim().toLowerCase()
    if (!email) return c.json({ error: "invalid_identity", message: "The identity provider returned no email" }, 400)

    // An unverified address cannot sign in. Kratos owns verification; restart that flow with a fresh
    // state so device approval and invitations survive the round trip.
    const verified = verifiedEmail(identity)
    if (!verified) {
      const state = await createAuthState(deps.db.write, {
        kind: "verification",
        ...(pending?.device_code_hash ? { deviceCodeHash: pending.device_code_hash } : {}),
        ...(pending?.user_code ? { userCode: pending.user_code } : {}),
        ...(pending?.invite_id ? { inviteId: pending.invite_id } : {}),
        ...(pending?.return_to ? { returnTo: pending.return_to } : {}),
      })
      return c.redirect(
        flowUrl("verification", `${deps.env.BALLM_PUBLIC_URL}/auth/password/complete?state=${state}`),
      )
    }

    const name = identityName(identity)
    const user = await findOrCreateIdentityUser(deps.db.write, {
      identityId: identity.identity.id,
      email: verified,
      ...(name ? { name } : {}),
      verifiedAt: new Date(),
    })
    const personal = await ensurePersonalOrg(deps.db.write, { userId: user.id, email: user.email, name: user.name })

    const accepted = pending?.invite_id ? await acceptInvite(deps.db.write, pending.invite_id, user.id) : undefined

    const previous = await browserSession(deps.db.write, readCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL)))
    const memberships = await orgsForUser(deps.db.write, user.id)
    const candidate = accepted?.org_id ?? previous?.org_id ?? personal.id
    const orgId = memberships.some((org) => org.id === candidate) ? candidate : (memberships[0]?.id ?? personal.id)

    const sessionId = await createSession(deps.db.write, {
      userId: user.id,
      orgId,
      method: "password",
      userAgent: c.req.header("user-agent"),
      ip: clientIp(c, deps.env.BALLM_TRUST_PROXY),
    })

    if (pending?.device_code_hash) {
      await approveDeviceCode(deps.db.write, {
        deviceHash: pending.device_code_hash,
        userId: user.id,
        orgId,
        sessionId,
      })
      await audit(deps.db.write, {
        kind: "device.approved",
        orgId,
        userId: user.id,
        sessionId,
        detail: { userCode: pending.user_code, method: "password" },
      })
    }

    const browser = await createBrowserSession(deps.db.write, {
      userId: user.id,
      orgId,
      ttlSeconds: deps.env.BALLM_BROWSER_TTL,
    })
    setCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL), browser.cookie, {
      maxAge: deps.env.BALLM_BROWSER_TTL,
      secure: secureCookie(),
    })
    await audit(deps.db.write, { kind: "auth.password", orgId, userId: user.id })

    if (pending?.device_code_hash)
      return c.redirect(`/console/device/success?user_code=${encodeURIComponent(pending.user_code ?? "")}`)
    return c.redirect(pending?.return_to ?? "/console/")
  })

  return app satisfies App
}

/** Public invitation lookup and acceptance. Acceptance requires an existing browser session. */
export function inviteRoutes(deps: Deps) {
  const app = new Hono<{ Variables: import("../deps").Variables }>()

  app.get("/auth/invite", async (c) => {
    const limited = await rateLimit(c, deps, "invite.lookup", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE)
    if (limited) return limited
    const token = c.req.query("token")?.trim()
    if (!token) return c.json({ error: "invalid_request", message: "Missing invitation token" }, 400)
    const invite = await inviteByToken(deps.db.write, token)
    if (!invite) return c.json({ error: "invalid_invite", message: "That invitation is unknown or has expired" }, 404)
    return c.json({ orgName: invite.org_name, orgSlug: invite.org_slug, email: invite.email, role: invite.role })
  })

  app.post("/auth/invite/accept", async (c) => {
    const limited = await rateLimit(c, deps, "invite.accept", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE)
    if (limited) return limited
    assertSameOrigin(c, deps.env.BALLM_PUBLIC_URL)
    const body = (await c.req.json().catch(() => ({}))) as { token?: unknown }
    if (typeof body.token !== "string") return c.json({ error: "invalid_request", message: "Missing token" }, 400)

    const browser = await browserSession(deps.db.write, readCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL)))
    if (!browser) return c.json({ error: "unauthorized", message: "Sign in to accept this invitation" }, 401)

    const invite = await inviteByToken(deps.db.write, body.token)
    if (!invite) return c.json({ error: "invalid_invite", message: "That invitation is unknown or has expired" }, 404)

    const rows = await deps.db.write<{ email: string }[]>`SELECT email FROM users WHERE id = ${browser.user_id} LIMIT 1`
    if (invite.email.toLowerCase() !== rows[0]?.email.toLowerCase())
      return c.json({ error: "forbidden", message: "This invitation was sent to a different address" }, 403)

    await acceptInvite(deps.db.write, invite.id, browser.user_id)
    await audit(deps.db.write, {
      kind: "member.invite.accept",
      orgId: invite.org_id,
      userId: browser.user_id,
      detail: { email: invite.email, role: invite.role },
    })
    return c.json({ ok: true, orgId: invite.org_id, orgSlug: invite.org_slug })
  })

  return app satisfies App
}

import type { Context, MiddlewareHandler } from "hono"
import { csrfToken, verifyCsrfToken } from "@ballm/platform/auth"
import { ApiError, readCookie } from "@ballm/platform/http"
import type { Deps } from "../deps"
import { browserSession } from "../store"
import { browserCookieName } from "./cookies"
import { orgsWithRoles, roleInOrg, userById, type Role } from "./store"

export const CSRF_HEADER = "x-ballm-csrf"
export const ORG_HEADER = "x-org-id"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * Every browser console request is cookie-authenticated. The organization comes from `X-Org-Id`
 * and must match a real membership; the role is always read from the database, never from the
 * client.
 */
export function consoleAuth(deps: Deps): MiddlewareHandler {
  return async (c, next) => {
    const browser = await browserSession(deps.db.write, readCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL)))
    if (!browser) throw new ApiError(401, "unauthorized", "Sign in to continue")

    const user = await userById(deps.db.write, browser.user_id)
    if (!user) throw new ApiError(401, "unauthorized", "User no longer exists")

    const orgs = await orgsWithRoles(deps.db.write, browser.user_id)
    if (orgs.length === 0) throw new ApiError(403, "forbidden", "You are not a member of any organization")

    const requested = c.req.header(ORG_HEADER) ?? browser.org_id
    const org = orgs.find((item) => item.id === requested)
    if (!org) throw new ApiError(403, "forbidden", "No membership in this organization")

    const role = (await roleInOrg(deps.db.write, browser.user_id, org.id)) ?? org.role
    c.set("console", {
      user,
      sessionId: browser.id,
      browserOrgId: browser.org_id,
      orgId: org.id,
      org,
      role,
      csrf: csrfToken(deps.env.encryptionKey, browser.id),
    })

    if (!SAFE_METHODS.has(c.req.method)) {
      assertSameOrigin(c, deps.env.BALLM_PUBLIC_URL)
      const header = c.req.header(CSRF_HEADER)
      if (!verifyCsrfToken(deps.env.encryptionKey, browser.id, header))
        throw new ApiError(403, "csrf_failed", "Missing or invalid CSRF token")
    }

    await next()
  }
}

/**
 * Cookie-authenticated mutations must come from the console's own origin. The CSRF token is the
 * primary control; this rejects cross-site form posts even if a token ever leaks.
 *
 * The canonical public origin is accepted, and so is the origin the request actually arrived on.
 * A reverse proxy or an internal DNS alias can therefore serve the console without weakening the
 * check: a cross-site request still carries the attacker's origin.
 */
export function assertSameOrigin(c: Context, publicUrl: string) {
  const origin = c.req.header("origin")
  if (!origin) {
    const site = c.req.header("sec-fetch-site")
    if (site && site !== "same-origin" && site !== "none")
      throw new ApiError(403, "forbidden_origin", "Cross-site requests are not allowed")
    return
  }

  const expected = new URL(publicUrl).origin
  const requestUrl = new URL(c.req.url)
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? requestUrl.host
  const proto = c.req.header("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "")
  const requestOrigin = `${proto}://${host}`
  if (origin !== expected && origin !== requestOrigin)
    throw new ApiError(403, "forbidden_origin", "Request origin is not allowed")

  const site = c.req.header("sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none")
    throw new ApiError(403, "forbidden_origin", "Cross-site requests are not allowed")
}

export function requireRole(c: Context<{ Variables: import("../deps").Variables }>, allowed: readonly Role[]) {
  const context = c.get("console")
  if (!context) throw new ApiError(401, "unauthorized", "Sign in to continue")
  if (!allowed.includes(context.role))
    throw new ApiError(403, "forbidden", "Your role does not allow this action")
  return context
}

export function consoleContext(c: Context<{ Variables: import("../deps").Variables }>) {
  const context = c.get("console")
  if (!context) throw new ApiError(401, "unauthorized", "Sign in to continue")
  return context
}

export function capabilities(role: Role, kind: "personal" | "team") {
  const team = kind === "team"
  return {
    manageMembers: team && (role === "owner" || role === "admin"),
    manageOwners: team && role === "owner",
    manageModels: role === "owner" || role === "admin",
    managePolicies: role === "owner" || role === "admin",
    manageSso: team && (role === "owner" || role === "admin"),
    manageUpstream: role === "owner" || role === "admin",
    viewAudit: role === "owner" || role === "admin",
    viewUsage: role === "owner" || role === "admin",
  }
}

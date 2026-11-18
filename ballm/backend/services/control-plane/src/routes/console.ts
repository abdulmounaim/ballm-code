import { Hono } from "hono"
import { z } from "zod"
import { randomToken } from "@ballm/platform/auth"
import { clearCookie, clientIp, parseBody, readCookie } from "@ballm/platform/http"
import type { App, Deps } from "../deps"
import { rateLimit } from "../rate-limit"
import {
  addOrgMember,
  approveDeviceCode,
  audit,
  browserSession,
  createOidcState,
  createSession,
  defaultPolicies,
  deviceByUserCode,
  getOrgConfig,
  membership,
  orgForEmailDomain,
  removeOrgMember,
  revokeSession,
  setOrgModels,
  setOrgSettings,
  setPolicies,
  setSso,
  ssoForOrg,
  upsertModel,
} from "../store"
import { authorizationUrl, discover, pkce } from "../sso/oidc"
import { oidcConnection } from "../sso/connection"
import { assertSameOrigin, capabilities, consoleAuth, consoleContext, requireRole } from "../console/auth"
import { browserCookieName } from "../console/cookies"
import {
  auditFeed,
  auditKinds,
  catalogForOrg,
  members,
  modelIdsExist,
  orgModelIds,
  orgPolicies,
  orgSessions,
  orgSso,
  orgUpstream,
  orgsWithRoles,
  overview,
  ownerCount,
  roleInOrg,
  sessionOwner,
  updateMemberRole,
  usageByDay,
  usageByModel,
  usageByUser,
  userById,
  userSessions,
} from "../console/store"

const RoleInput = z.enum(["owner", "admin", "member"])

const MemberInput = z.object({
  email: z.string().email().max(320),
  role: RoleInput.default("member"),
})

const MemberPatchInput = z.object({ role: RoleInput })

const ModelInput = z.object({
  id: z
    .string()
    .min(1)
    .max(96)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "Model ids use lowercase letters, numbers, dots, underscores, and hyphens"),
  name: z.string().min(1).max(120),
  upstreamModel: z.string().min(1).max(160),
  contextLimit: z.number().int().positive().max(10_000_000).optional(),
  outputLimit: z.number().int().positive().max(10_000_000).optional(),
  enabled: z.boolean().optional(),
})

const OrgModelsInput = z.object({
  modelIds: z.array(z.string().min(1).max(96)).max(200),
})

const PolicyStatement = z.object({
  action: z.string().min(1).max(120),
  resource: z.string().min(1).max(240),
  effect: z.enum(["allow", "deny"]),
})

const PoliciesInput = z.object({ statements: z.array(PolicyStatement).max(500) })

const SsoInput = z.object({
  issuer: z.string().url().max(500),
  clientId: z.string().min(1).max(300),
  clientSecret: z.string().min(1).max(2000).optional(),
  scopes: z.string().min(1).max(300).optional(),
  allowedDomains: z.array(z.string().min(1).max(253)).max(100).default([]),
  groupClaim: z.string().min(1).max(120).optional(),
  groupRoles: z.record(z.string().max(120), RoleInput).optional(),
  enabled: z.boolean().optional(),
})

const UpstreamInput = z.object({
  baseUrl: z.string().url().max(500).nullable().optional(),
  apiKey: z.string().min(1).max(4000).nullable().optional(),
})

const DeviceStartInput = z.object({
  userCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "Enter the code shown in your terminal"),
  email: z.string().email().max(320),
})

const DeviceApproveInput = z.object({
  userCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "Enter the code shown in your terminal"),
})

export function consoleRoutes(deps: Deps) {
  const app = new Hono<{ Variables: import("../deps").Variables }>()

  // Public routes are registered before the auth middleware, so they never require a browser
  // session. They are still origin-checked and rate limited.
  app.post("/api/console/device/start", async (c) => {
    const limited = await rateLimit(c, deps, "console.device.start", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE)
    if (limited) return limited
    assertSameOrigin(c, deps.env.BALLM_PUBLIC_URL)

    const input = await parseBody(c, DeviceStartInput)
    const device = await deviceByUserCode(deps.db.write, input.userCode)
    if (!device || device.status !== "pending" || device.expires_at.getTime() <= Date.now())
      return c.json({ error: "invalid_code", message: "That code is unknown, expired, or already used" }, 400)

    const result = await startSso(deps, input.email, {
      deviceCodeHash: device.device_code_hash,
      userCode: device.user_code,
    })
    if (!result.ok) return c.json({ error: "sso_not_configured", message: result.message }, 400)
    return c.json({ redirectUrl: result.redirectUrl })
  })

  /** Email-domain discovery for console sign-in. */
  app.post("/api/console/sign-in", async (c) => {
    const limited = await rateLimit(c, deps, "console.signin", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE)
    if (limited) return limited
    assertSameOrigin(c, deps.env.BALLM_PUBLIC_URL)
    const input = await parseBody(c, z.object({ email: z.string().email().max(320) }))
    const result = await startSso(deps, input.email)
    if (!result.ok) return c.json({ error: "sso_not_configured", message: result.message }, 400)
    return c.json({ redirectUrl: result.redirectUrl })
  })

  app.get("/api/console/device", async (c) => {
    const browser = await browserSession(deps.db.write, readCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL)))
    if (!browser) return c.json({ signedIn: false })

    const user = await userById(deps.db.write, browser.user_id)
    const orgs = await orgsWithRoles(deps.db.write, browser.user_id)
    const org = orgs.find((item) => item.id === browser.org_id) ?? orgs[0]
    const code = (c.req.query("user_code") ?? "").trim().toUpperCase()
    const device = code ? await deviceByUserCode(deps.db.write, code) : undefined
    return c.json({
      signedIn: true,
      user,
      org,
      code: code || undefined,
      codeStatus: !device
        ? "unknown"
        : device.status === "pending" && device.expires_at.getTime() > Date.now()
          ? "pending"
          : "expired",
    })
  })

  app.post("/api/console/logout", async (c) => {
    const limited = await rateLimit(c, deps, "console.logout", 60)
    if (limited) return limited
    assertSameOrigin(c, deps.env.BALLM_PUBLIC_URL)
    const browser = await browserSession(deps.db.write, readCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL)))
    if (browser) await deps.db.write`UPDATE browser_sessions SET revoked_at = now() WHERE id = ${browser.id}`
    clearCookie(c, browserCookieName(deps.env.BALLM_PUBLIC_URL), deps.env.BALLM_PUBLIC_URL.startsWith("https://"))
    return c.json({ ok: true })
  })

  app.use("/api/console/*", consoleAuth(deps))

  app.get("/api/console/session", async (c) => {
    const context = consoleContext(c)
    return c.json({
      user: context.user,
      orgs: await orgsWithRoles(deps.db.write, context.user.id),
      org: context.org,
      role: context.role,
      csrf: context.csrf,
      capabilities: capabilities(context.role),
    })
  })

  app.get("/api/console/overview", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const [summary, day, byModel, byUser, upstream, sso, recent] = await Promise.all([
      overview(deps.db.write, context.orgId),
      usageByDay(deps.db.write, context.orgId, 14),
      usageByModel(deps.db.write, context.orgId, 30),
      usageByUser(deps.db.write, context.orgId, 30),
      orgUpstream(deps.db.write, context.orgId),
      orgSso(deps.db.write, context.orgId),
      auditFeed(deps.db.write, context.orgId, { limit: 6 }),
    ])
    return c.json({
      summary,
      usage: { byDay: day, byModel, byUser },
      readiness: {
        upstream: Boolean(upstream?.upstream_base_url ?? deps.env.BALLM_UPSTREAM_BASE_URL),
        hasUpstreamKey: Boolean(upstream?.has_api_key ?? deps.env.BALLM_UPSTREAM_API_KEY),
        sso: Boolean(sso?.enabled),
        owners: await ownerCount(deps.db.write, context.orgId),
      },
      recent,
    })
  })

  app.get("/api/console/me", async (c) => {
    const context = consoleContext(c)
    return c.json({
      user: context.user,
      org: context.org,
      role: context.role,
      sessions: await userSessions(deps.db.write, context.orgId, context.user.id),
    })
  })

  app.delete("/api/console/me/sessions/:id", async (c) => {
    const context = consoleContext(c)
    const session = await sessionOwner(deps.db.write, c.req.param("id"))
    if (!session || session.user_id !== context.user.id) return c.json({ error: "not_found" }, 404)
    await revokeSession(deps.db.write, session.id)
    await deps.cache.set(`ballm:revoked:${session.id}`, "1", deps.env.BALLM_ACCESS_TTL)
    await audit(deps.db.write, {
      kind: "console.session.revoke_self",
      orgId: context.orgId,
      userId: context.user.id,
      sessionId: session.id,
    })
    return c.json({ ok: true })
  })

  app.get("/api/console/members", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const query = c.req.query("query")?.trim() || undefined
    return c.json({ members: await members(deps.db.write, context.orgId, query), ownerCount: await ownerCount(deps.db.write, context.orgId) })
  })

  app.post("/api/console/members", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const input = await parseBody(c, MemberInput)
    if (input.role === "owner" && context.role !== "owner")
      return c.json({ error: "forbidden", message: "Only an owner can add another owner" }, 403)
    const email = input.email.trim().toLowerCase()
    const user = await addOrgMember(deps.db.write, { orgId: context.orgId, email, role: input.role })
    await audit(deps.db.write, {
      kind: "console.member.add",
      orgId: context.orgId,
      userId: context.user.id,
      detail: { email, role: input.role },
    })
    return c.json({ user, role: input.role }, 201)
  })

  app.patch("/api/console/members/:userId", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const input = await parseBody(c, MemberPatchInput)
    const userId = c.req.param("userId")
    const current = await roleInOrg(deps.db.write, userId, context.orgId)
    if (!current) return c.json({ error: "not_found" }, 404)

    if (context.role !== "owner" && (current === "owner" || input.role === "owner"))
      return c.json({ error: "forbidden", message: "Only an owner can change owner roles" }, 403)
    if (current === "owner" && input.role !== "owner" && (await ownerCount(deps.db.write, context.orgId)) <= 1)
      return c.json({ error: "conflict", message: "The organization needs at least one owner" }, 409)

    await updateMemberRole(deps.db.write, context.orgId, userId, input.role)
    await audit(deps.db.write, {
      kind: "console.member.role",
      orgId: context.orgId,
      userId: context.user.id,
      detail: { target: userId, from: current, to: input.role },
    })
    return c.json({ ok: true, role: input.role })
  })

  app.delete("/api/console/members/:userId", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const userId = c.req.param("userId")
    const current = await roleInOrg(deps.db.write, userId, context.orgId)
    if (!current) return c.json({ error: "not_found" }, 404)
    if (current === "owner" && context.role !== "owner")
      return c.json({ error: "forbidden", message: "Only an owner can remove an owner" }, 403)
    if (current !== "member" && context.role !== "owner")
      return c.json({ error: "forbidden", message: "Only an owner can remove an admin" }, 403)
    if (current === "owner" && (await ownerCount(deps.db.write, context.orgId)) <= 1)
      return c.json({ error: "conflict", message: "The organization needs at least one owner" }, 409)

    await removeOrgMember(deps.db.write, context.orgId, userId)
    const revoked = await revokeOrgSessions(deps, context.orgId, userId)
    await audit(deps.db.write, {
      kind: "console.member.remove",
      orgId: context.orgId,
      userId: context.user.id,
      detail: { target: userId, revokedSessions: revoked },
    })
    return c.json({ ok: true, revokedSessions: revoked })
  })

  app.get("/api/console/models", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    return c.json({ models: await catalogForOrg(deps.db.write, context.orgId) })
  })

  app.put("/api/console/models/:id", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const input = await parseBody(c, ModelInput)
    if (input.id !== c.req.param("id"))
      return c.json({ error: "invalid_request", message: "Model id does not match the path" }, 400)
    const model = await upsertModel(deps.db.write, input)
    await invalidate(deps, context.orgId)
    await audit(deps.db.write, {
      kind: "console.model.upsert",
      orgId: context.orgId,
      userId: context.user.id,
      detail: { id: model.id },
    })
    return c.json(model)
  })

  app.put("/api/console/models", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const input = await parseBody(c, OrgModelsInput)
    const unique = Array.from(new Set(input.modelIds))
    const known = await modelIdsExist(deps.db.write, unique)
    const missing = unique.filter((id) => !known.includes(id))
    if (missing.length > 0)
      return c.json({ error: "invalid_request", message: `Unknown model: ${missing.join(", ")}` }, 400)
    await setOrgModels(deps.db.write, context.orgId, unique)
    await invalidate(deps, context.orgId)
    await audit(deps.db.write, {
      kind: "console.model.allowlist",
      orgId: context.orgId,
      userId: context.user.id,
      detail: { modelIds: unique },
    })
    return c.json({ ok: true, modelIds: unique })
  })

  app.get("/api/console/policies", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const statements = await orgPolicies(deps.db.write, context.orgId)
    const defaults = defaultPolicies()
    const current = Array.isArray(statements) && statements.length > 0 ? statements : defaults
    return c.json({
      statements: current,
      inherited: canonicalPolicies(current) === canonicalPolicies(defaults),
      defaults,
    })
  })

  app.put("/api/console/policies", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const input = await parseBody(c, PoliciesInput)
    await setPolicies(deps.db.write, context.orgId, input.statements)
    await invalidate(deps, context.orgId)
    await audit(deps.db.write, {
      kind: "console.policy.update",
      orgId: context.orgId,
      userId: context.user.id,
      detail: { statements: input.statements.length },
    })
    return c.json({ ok: true, statements: input.statements })
  })

  app.get("/api/console/sso", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const redirectUri = `${deps.env.BALLM_PUBLIC_URL}/auth/sso/callback`
    const sso = await orgSso(deps.db.write, context.orgId)
    if (!sso) return c.json({ configured: false, redirectUri })
    return c.json({
      configured: true,
      redirectUri,
      issuer: sso.issuer,
      clientId: sso.client_id,
      scopes: sso.scopes,
      allowedDomains: sso.allowed_domains,
      groupClaim: sso.group_claim,
      groupRoles: sso.group_roles,
      enabled: sso.enabled,
      hasClientSecret: sso.has_secret,
      updatedAt: sso.updated_at,
    })
  })

  app.post("/api/console/sso/test", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const limited = await rateLimit(c, deps, "console.sso.test", 20)
    if (limited) return limited
    const input = await parseBody(c, z.object({ issuer: z.string().url().max(500) }))
    const issuer = input.issuer.replace(/\/+$/, "")
    if (deps.env.BALLM_ENV === "production" && !issuer.startsWith("https://"))
      return c.json({ ok: false, message: "The issuer must use HTTPS in production" }, 400)
    try {
      const config = await discover(issuer)
      await audit(deps.db.write, {
        kind: "console.sso.discovery",
        orgId: context.orgId,
        userId: context.user.id,
        detail: { issuer },
      })
      return c.json({
        ok: true,
        issuer: config.issuer,
        authorizationEndpoint: config.authorization_endpoint,
        tokenEndpoint: config.token_endpoint,
        jwksUri: config.jwks_uri,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : ""
      const unreachable = /ENOTFOUND|ECONNREFUSED|fetch failed|timed out|TimeoutError|network/i.test(detail)
      return c.json({
        ok: false,
        message: unreachable
          ? "The issuer could not be reached. Check the URL and that the control plane can reach it."
          : detail || "OIDC discovery failed",
      })
    }
  })

  app.put("/api/console/sso", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const input = await parseBody(c, SsoInput)
    if (deps.env.BALLM_ENV === "production" && !input.issuer.startsWith("https://"))
      return c.json({ error: "invalid_request", message: "The issuer must use HTTPS in production" }, 400)

    const existing = await ssoForOrg(deps.db.write, context.orgId)
    if (!input.clientSecret && !existing)
      return c.json({ error: "invalid_request", message: "A client secret is required" }, 400)

    await setSso(deps.db.write, {
      orgId: context.orgId,
      issuer: input.issuer.replace(/\/+$/, ""),
      clientId: input.clientId,
      encryptedClientSecret: input.clientSecret
        ? deps.secrets.seal(input.clientSecret)
        : existing!.encrypted_client_secret,
      scopes: input.scopes ?? existing?.scopes ?? "openid email profile",
      allowedDomains: Array.from(new Set(input.allowedDomains.map((domain) => domain.trim().toLowerCase()).filter(Boolean))),
      groupClaim: input.groupClaim,
      groupRoles: input.groupRoles,
      enabled: input.enabled,
    })
    await invalidate(deps, context.orgId)
    await audit(deps.db.write, {
      kind: "console.sso.update",
      orgId: context.orgId,
      userId: context.user.id,
      detail: { issuer: input.issuer, domains: input.allowedDomains.length },
    })
    return c.json({ ok: true })
  })

  app.get("/api/console/upstream", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const upstream = await orgUpstream(deps.db.write, context.orgId)
    return c.json({
      baseUrl: upstream?.upstream_base_url ?? null,
      hasApiKey: upstream?.has_api_key ?? false,
      fallbackConfigured: Boolean(deps.env.BALLM_UPSTREAM_BASE_URL),
    })
  })

  app.put("/api/console/upstream", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const input = await parseBody(c, UpstreamInput)
    if (input.baseUrl === null && deps.env.BALLM_ENV === "production" && !deps.env.BALLM_UPSTREAM_BASE_URL)
      return c.json({ error: "invalid_request", message: "A base URL is required" }, 400)
    await setOrgSettings(deps.db.write, {
      orgId: context.orgId,
      upstreamBaseUrl: input.baseUrl,
      encryptedUpstreamApiKey: input.apiKey === undefined ? undefined : input.apiKey === null ? null : deps.secrets.seal(input.apiKey),
    })
    await invalidate(deps, context.orgId)
    await audit(deps.db.write, {
      kind: "console.upstream.update",
      orgId: context.orgId,
      userId: context.user.id,
      detail: { baseUrl: input.baseUrl ?? null, keyChanged: input.apiKey !== undefined },
    })
    return c.json({ ok: true })
  })

  app.post("/api/console/upstream/test", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const limited = await rateLimit(c, deps, "console.upstream.test", 10)
    if (limited) return limited
    const config = await getOrgConfig(deps.db.write, context.orgId)
    const baseUrl = config.upstreamBaseUrl ?? deps.env.BALLM_UPSTREAM_BASE_URL
    if (!baseUrl)
      return c.json({ ok: false, message: "No upstream base URL is configured for this organization" }, 400)

    const apiKey = config.encryptedUpstreamApiKey ? deps.secrets.open(config.encryptedUpstreamApiKey) : undefined
    const started = performance.now()
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
        headers: {
          accept: "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(8_000),
      })
      const latencyMs = Math.round(performance.now() - started)
      return c.json({
        ok: response.ok,
        status: response.status,
        latencyMs,
        message: response.ok ? "Upstream reached" : `Upstream replied with HTTP ${response.status}`,
      })
    } catch (error) {
      const latencyMs = Math.round(performance.now() - started)
      const timedOut = error instanceof Error && error.name === "TimeoutError"
      return c.json({
        ok: false,
        status: 0,
        latencyMs,
        message: timedOut ? "Upstream timed out after 8s" : "Upstream could not be reached",
      })
    }
  })

  app.get("/api/console/sessions", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    return c.json({ sessions: await orgSessions(deps.db.write, context.orgId) })
  })

  app.delete("/api/console/sessions/:id", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const session = await sessionOwner(deps.db.write, c.req.param("id"))
    if (!session || session.org_id !== context.orgId) return c.json({ error: "not_found" }, 404)
    const targetRole = await roleInOrg(deps.db.write, session.user_id, context.orgId)
    if (context.role !== "owner" && (targetRole === "owner" || targetRole === "admin"))
      return c.json({ error: "forbidden", message: "Only an owner can revoke an admin session" }, 403)

    await revokeSession(deps.db.write, session.id)
    await deps.cache.set(`ballm:revoked:${session.id}`, "1", deps.env.BALLM_ACCESS_TTL)
    await audit(deps.db.write, {
      kind: "console.session.revoke",
      orgId: context.orgId,
      userId: context.user.id,
      detail: { sessionId: session.id, target: session.user_id },
    })
    return c.json({ ok: true })
  })

  app.get("/api/console/usage", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const days = clampInt(c.req.query("days"), 1, 90, 30)
    const [byDay, byModel, byUser] = await Promise.all([
      usageByDay(deps.db.write, context.orgId, days),
      usageByModel(deps.db.write, context.orgId, days),
      usageByUser(deps.db.write, context.orgId, days),
    ])
    return c.json({ days, byDay, byModel, byUser })
  })

  app.get("/api/console/audit", async (c) => {
    const context = requireRole(c, ["owner", "admin"])
    const limit = clampInt(c.req.query("limit"), 1, 200, 50)
    const before = c.req.query("before")
    const beforeId = c.req.query("beforeId")
    const cursor =
      before && beforeId && /^\d+$/.test(beforeId) ? { at: before, id: beforeId } : undefined
    const kind = c.req.query("kind")
    const [events, kinds] = await Promise.all([
      auditFeed(deps.db.write, context.orgId, { limit, before: cursor, kind }),
      auditKinds(deps.db.write, context.orgId),
    ])
    return c.json({ events, kinds })
  })

  // Device approval is a cookie mutation, so it is protected by the same auth middleware and CSRF
  // check as every other console route.
  app.post("/api/console/device/approve", async (c) => {
    const context = consoleContext(c)
    const limited = await rateLimit(c, deps, "console.device.approve", deps.env.BALLM_AUTH_RATE_LIMIT_PER_MINUTE)
    if (limited) return limited
    const input = await parseBody(c, DeviceApproveInput)
    const device = await deviceByUserCode(deps.db.write, input.userCode)
    if (!device || device.status !== "pending" || device.expires_at.getTime() <= Date.now())
      return c.json({ error: "invalid_code", message: "That code is unknown, expired, or already used" }, 400)
    const orgId = context.browserOrgId
    if (!(await membership(deps.db.write, context.user.id, orgId)))
      return c.json({ error: "forbidden", message: "You are no longer a member of this organization" }, 403)

    const sessionId = await createSession(deps.db.write, {
      userId: context.user.id,
      orgId,
      method: "device",
      userAgent: c.req.header("user-agent"),
      ip: clientIp(c, deps.env.BALLM_TRUST_PROXY),
    })
    await approveDeviceCode(deps.db.write, {
      deviceHash: device.device_code_hash,
      userId: context.user.id,
      orgId,
      sessionId,
    })
    await audit(deps.db.write, {
      kind: "device.approved",
      orgId,
      userId: context.user.id,
      sessionId,
      detail: { userCode: input.userCode },
    })
    return c.json({ ok: true })
  })

  return app satisfies App
}

async function startSso(
  deps: Deps,
  email: string,
  device?: { deviceCodeHash: string; userCode: string },
): Promise<{ ok: true; redirectUrl: string } | { ok: false; message: string }> {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase()
  const orgs = await orgForEmailDomain(deps.db.write, domain)
  const org = orgs[0]
  if (!org) return { ok: false, message: "No organization is configured for that email domain" }

  const sso = await ssoForOrg(deps.db.write, org.id)
  if (!sso?.enabled) return { ok: false, message: "This organization has no active SSO connection" }

  const { verifier, challenge } = pkce()
  const nonce = randomToken(16)
  const redirectUri = `${deps.env.BALLM_PUBLIC_URL}/auth/sso/callback`
  const state = await createOidcState(deps.db.write, {
    orgId: org.id,
    nonce,
    codeVerifier: verifier,
    redirectUri,
    deviceCodeHash: device?.deviceCodeHash,
    userCode: device?.userCode,
  })
  const redirectUrl = await authorizationUrl(oidcConnection(sso, deps.secrets), {
    redirectUri,
    state,
    nonce,
    codeChallenge: challenge,
  })
  return { ok: true, redirectUrl }
}

async function invalidate(deps: Deps, orgId: string) {
  await deps.cache.del(`ballm:orgcfg:${orgId}`)
  await deps.cache.publish("ballm:invalidate", orgId)
}

async function revokeOrgSessions(deps: Deps, orgId: string, userId: string) {
  const rows = await deps.db.write<{ id: string }[]>`
    UPDATE sessions SET revoked_at = now()
    WHERE org_id = ${orgId} AND user_id = ${userId} AND revoked_at IS NULL
    RETURNING id
  `
  await Promise.all(rows.map((row) => deps.cache.set(`ballm:revoked:${row.id}`, "1", deps.env.BALLM_ACCESS_TTL)))
  return rows.length
}

function canonicalPolicies(statements: unknown) {
  if (!Array.isArray(statements)) return ""
  return statements
    .map((statement) => {
      if (!statement || typeof statement !== "object") return ""
      const value = statement as Record<string, unknown>
      return `${String(value.action)}\u0000${String(value.resource)}\u0000${String(value.effect)}`
    })
    .join("\n")
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

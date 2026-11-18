import { Hono } from "hono"
import { z } from "zod"
import { parseBody } from "@ballm/platform/http"
import type { App, Deps } from "../deps"
import { adminAuth } from "../auth"
import {
  addOrgMember,
  audit,
  createOrg,
  listModels,
  listOrgUsers,
  listOrgs,
  orgById,
  removeOrgMember,
  revokeUserSessions,
  setOrgModels,
  setOrgSettings,
  setPolicies,
  setSso,
  ssoForOrg,
  upsertModel,
} from "../store"

const OrgInput = z.object({
  id: z.string().min(1).optional(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "slug must be lowercase letters, numbers, and hyphens"),
  name: z.string().min(1),
})

const MemberInput = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]).default("member"),
})

const ModelInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  upstreamModel: z.string().min(1),
  contextLimit: z.number().int().positive().optional(),
  outputLimit: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
})

const OrgModelsInput = z.object({ modelIds: z.array(z.string().min(1)) })

const PolicyInput = z.object({
  statements: z.array(
    z.object({
      action: z.string().min(1),
      resource: z.string().min(1),
      effect: z.enum(["allow", "deny"]),
    }),
  ),
})

const SsoInput = z.object({
  issuer: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1).optional(),
  scopes: z.string().min(1).optional(),
  allowedDomains: z.array(z.string().min(1)).default([]),
  groupClaim: z.string().min(1).optional(),
  groupRoles: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
})

const UpstreamInput = z.object({
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
})

export function adminRoutes(deps: Deps) {
  const app = new Hono<{ Variables: import("../deps").Variables }>()
  app.use("/api/v1/admin/*", adminAuth(deps))

  const invalidate = async (orgId: string) => {
    await deps.cache.del(`ballm:orgcfg:${orgId}`)
    await deps.cache.publish("ballm:invalidate", orgId)
  }

  app.get("/api/v1/admin/orgs", async (c) => c.json(await listOrgs(deps.db.read)))

  app.post("/api/v1/admin/orgs", async (c) => {
    const input = await parseBody(c, OrgInput)
    const org = await createOrg(deps.db.write, input)
    await audit(deps.db.write, { kind: "admin.org.create", orgId: org.id, detail: org })
    return c.json(org, 201)
  })

  app.get("/api/v1/admin/orgs/:orgId/users", async (c) => {
    const org = await orgById(deps.db.read, c.req.param("orgId"))
    if (!org) return c.json({ error: "not_found" }, 404)
    return c.json(await listOrgUsers(deps.db.read, org.id))
  })

  app.post("/api/v1/admin/orgs/:orgId/members", async (c) => {
    const org = await orgById(deps.db.read, c.req.param("orgId"))
    if (!org) return c.json({ error: "not_found" }, 404)
    const input = await parseBody(c, MemberInput)
    const user = await addOrgMember(deps.db.write, { orgId: org.id, email: input.email, role: input.role })
    await audit(deps.db.write, { kind: "admin.member.add", orgId: org.id, detail: { email: input.email, role: input.role } })
    return c.json({ user, role: input.role }, 201)
  })

  app.delete("/api/v1/admin/orgs/:orgId/members/:userId", async (c) => {
    const org = await orgById(deps.db.read, c.req.param("orgId"))
    if (!org) return c.json({ error: "not_found" }, 404)
    const userId = c.req.param("userId")
    await removeOrgMember(deps.db.write, org.id, userId)
    const sessions = await revokeUserSessions(deps.db.write, userId, org.id)
    await Promise.all(sessions.map((id) => deps.cache.set(`ballm:revoked:${id}`, "1", deps.env.BALLM_ACCESS_TTL)))
    await audit(deps.db.write, { kind: "admin.member.remove", orgId: org.id, detail: { userId } })
    return c.json({ ok: true, revokedSessions: sessions.length })
  })

  app.post("/api/v1/admin/users/:userId/revoke", async (c) => {
    const sessions = await revokeUserSessions(deps.db.write, c.req.param("userId"))
    await Promise.all(sessions.map((id) => deps.cache.set(`ballm:revoked:${id}`, "1", deps.env.BALLM_ACCESS_TTL)))
    await audit(deps.db.write, { kind: "admin.user.revoke", detail: { userId: c.req.param("userId") } })
    return c.json({ ok: true, revokedSessions: sessions.length })
  })

  app.get("/api/v1/admin/models", async (c) => c.json(await listModels(deps.db.read)))

  app.put("/api/v1/admin/models/:id", async (c) => {
    const input = await parseBody(c, ModelInput)
    if (input.id !== c.req.param("id")) return c.json({ error: "invalid_request", message: "Model id mismatch" }, 400)
    const model = await upsertModel(deps.db.write, input)
    await audit(deps.db.write, { kind: "admin.model.upsert", detail: model })
    return c.json(model)
  })

  app.put("/api/v1/admin/orgs/:orgId/models", async (c) => {
    const org = await orgById(deps.db.read, c.req.param("orgId"))
    if (!org) return c.json({ error: "not_found" }, 404)
    const input = await parseBody(c, OrgModelsInput)
    await setOrgModels(deps.db.write, org.id, input.modelIds)
    await invalidate(org.id)
    await audit(deps.db.write, { kind: "admin.org.models", orgId: org.id, detail: input })
    return c.json({ ok: true })
  })

  app.get("/api/v1/admin/orgs/:orgId/policies", async (c) => {
    const org = await orgById(deps.db.read, c.req.param("orgId"))
    if (!org) return c.json({ error: "not_found" }, 404)
    const rows = await deps.db.read<{ statements: unknown }[]>`
      SELECT statements FROM org_policies WHERE org_id = ${org.id} LIMIT 1
    `
    return c.json({ statements: rows[0]?.statements ?? [] })
  })

  app.put("/api/v1/admin/orgs/:orgId/policies", async (c) => {
    const org = await orgById(deps.db.read, c.req.param("orgId"))
    if (!org) return c.json({ error: "not_found" }, 404)
    const input = await parseBody(c, PolicyInput)
    await setPolicies(deps.db.write, org.id, input.statements)
    await invalidate(org.id)
    await audit(deps.db.write, { kind: "admin.org.policies", orgId: org.id, detail: input })
    return c.json({ ok: true })
  })

  app.get("/api/v1/admin/orgs/:orgId/sso", async (c) => {
    const org = await orgById(deps.db.read, c.req.param("orgId"))
    if (!org) return c.json({ error: "not_found" }, 404)
    const sso = await ssoForOrg(deps.db.read, org.id)
    if (!sso) return c.json({ configured: false })
    return c.json({
      configured: true,
      issuer: sso.issuer,
      clientId: sso.client_id,
      scopes: sso.scopes,
      allowedDomains: sso.allowed_domains,
      groupClaim: sso.group_claim,
      groupRoles: sso.group_roles,
      enabled: sso.enabled,
      hasClientSecret: true,
    })
  })

  app.put("/api/v1/admin/orgs/:orgId/sso", async (c) => {
    const org = await orgById(deps.db.read, c.req.param("orgId"))
    if (!org) return c.json({ error: "not_found" }, 404)
    const input = await parseBody(c, SsoInput)
    const existing = await ssoForOrg(deps.db.read, org.id)
    if (!input.clientSecret && !existing)
      return c.json({ error: "invalid_request", message: "clientSecret is required for a new SSO connection" }, 400)
    await setSso(deps.db.write, {
      orgId: org.id,
      issuer: input.issuer,
      clientId: input.clientId,
      encryptedClientSecret: input.clientSecret
        ? deps.secrets.seal(input.clientSecret)
        : existing!.encrypted_client_secret,
      scopes: input.scopes ?? existing?.scopes ?? "openid email profile",
      allowedDomains: input.allowedDomains.map((domain) => domain.toLowerCase()),
      groupClaim: input.groupClaim,
      groupRoles: input.groupRoles,
      enabled: input.enabled,
    })
    await invalidate(org.id)
    await audit(deps.db.write, { kind: "admin.org.sso", orgId: org.id })
    return c.json({ ok: true })
  })

  app.put("/api/v1/admin/orgs/:orgId/upstream", async (c) => {
    const org = await orgById(deps.db.read, c.req.param("orgId"))
    if (!org) return c.json({ error: "not_found" }, 404)
    const input = await parseBody(c, UpstreamInput)
    await setOrgSettings(deps.db.write, {
      orgId: org.id,
      upstreamBaseUrl: input.baseUrl,
      encryptedUpstreamApiKey: input.apiKey ? deps.secrets.seal(input.apiKey) : undefined,
    })
    await invalidate(org.id)
    await audit(deps.db.write, { kind: "admin.org.upstream", orgId: org.id })
    return c.json({ ok: true })
  })

  return app satisfies App
}

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createSession } from "../services/control-plane/src/store"
import { adminToken, setupContext, type TestContext } from "./helpers"

function admin(token = adminToken) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" }
}

describe("admin API", () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await setupContext()
  })

  afterEach(async () => {
    await ctx.close()
  })

  test("manages orgs, models, policies, and SSO configuration", async () => {
    const denied = await ctx.app.request("/api/v1/admin/orgs")
    expect(denied.status).toBe(401)

    const orgResponse = await ctx.app.request("/api/v1/admin/orgs", {
      method: "POST",
      headers: admin(),
      body: JSON.stringify({ slug: "platform", name: "Platform" }),
    })
    expect(orgResponse.status).toBe(201)
    const org = (await orgResponse.json()) as { id: string; slug: string }

    const modelResponse = await ctx.app.request("/api/v1/admin/models/ballm-reasoning", {
      method: "PUT",
      headers: admin(),
      body: JSON.stringify({
        id: "ballm-reasoning",
        name: "Ballm Reasoning",
        upstreamModel: "reasoning-v1",
        contextLimit: 200_000,
        outputLimit: 32_000,
      }),
    })
    expect(modelResponse.status).toBe(200)

    const assign = await ctx.app.request(`/api/v1/admin/orgs/${org.id}/models`, {
      method: "PUT",
      headers: admin(),
      body: JSON.stringify({ modelIds: ["ballm-reasoning"] }),
    })
    expect(assign.status).toBe(200)

    const policies = [
      { action: "provider.use", resource: "*", effect: "deny" },
      { action: "provider.use", resource: "ballm", effect: "allow" },
    ]
    const policyResponse = await ctx.app.request(`/api/v1/admin/orgs/${org.id}/policies`, {
      method: "PUT",
      headers: admin(),
      body: JSON.stringify({ statements: policies }),
    })
    expect(policyResponse.status).toBe(200)

    const readPolicies = await ctx.app.request(`/api/v1/admin/orgs/${org.id}/policies`, { headers: admin() })
    expect((await readPolicies.json()) as { statements: unknown }).toEqual({ statements: policies })

    const missing = await ctx.app.request(`/api/v1/admin/orgs/${org.id}/sso`, {
      method: "PUT",
      headers: admin(),
      body: JSON.stringify({
        issuer: "https://idp.test",
        clientId: "client",
        allowedDomains: ["test.internal"],
      }),
    })
    expect(missing.status).toBe(400)

    const sso = await ctx.app.request(`/api/v1/admin/orgs/${org.id}/sso`, {
      method: "PUT",
      headers: admin(),
      body: JSON.stringify({
        issuer: "https://idp.test",
        clientId: "client",
        clientSecret: "secret",
        allowedDomains: ["test.internal"],
        groupClaim: "groups",
        groupRoles: { platform: "admin" },
      }),
    })
    expect(sso.status).toBe(200)

    const readSso = await ctx.app.request(`/api/v1/admin/orgs/${org.id}/sso`, { headers: admin() })
    const payload = (await readSso.json()) as Record<string, unknown>
    expect(payload.configured).toBe(true)
    expect(payload.hasClientSecret).toBe(true)
    expect(payload.encryptedClientSecret).toBeUndefined()

    const upstream = await ctx.app.request(`/api/v1/admin/orgs/${org.id}/upstream`, {
      method: "PUT",
      headers: admin(),
      body: JSON.stringify({ baseUrl: "https://upstream.test/v1", apiKey: "upstream-key" }),
    })
    expect(upstream.status).toBe(200)

    const users = await ctx.app.request(`/api/v1/admin/orgs/${org.id}/users`, { headers: admin() })
    expect(users.status).toBe(200)

    const member = await ctx.app.request(`/api/v1/admin/orgs/${org.id}/members`, {
      method: "POST",
      headers: admin(),
      body: JSON.stringify({ email: "member@test.internal", role: "member" }),
    })
    expect(member.status).toBe(201)
    const memberUser = (await member.json()) as { user: { id: string } }
    const sessionId = await createSession(ctx.db.write, {
      userId: memberUser.user.id,
      orgId: org.id,
      method: "dev",
    })
    const revoke = await ctx.app.request(`/api/v1/admin/users/${memberUser.user.id}/revoke`, {
      method: "POST",
      headers: admin(),
    })
    expect(revoke.status).toBe(200)
    expect(await revoke.json()).toEqual({ ok: true, revokedSessions: 1 })
    const session = await ctx.db.read<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM sessions WHERE id = ${sessionId}
    `
    expect(session[0]?.revoked_at).not.toBeNull()
  })
})

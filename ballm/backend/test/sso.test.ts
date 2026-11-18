import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { SignJWT, exportJWK, generateKeyPair } from "jose"
import { ensureMembership, findOrCreateUser } from "../services/control-plane/src/store"
import { adminToken, createTestOrg, setupContext, type TestContext } from "./helpers"

interface MockOidc {
  url: string
  setEmail(email: string): void
  setNonce(nonce: string): void
  close(): void
}

async function mockOidc(): Promise<MockOidc> {
  const pair = await generateKeyPair("RS256", { extractable: true })
  const jwk = await exportJWK(pair.publicKey)
  let email = "dev@test.internal"
  let nonce = ""

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/.well-known/openid-configuration")
        return Response.json({
          issuer: url.origin,
          authorization_endpoint: `${url.origin}/authorize`,
          token_endpoint: `${url.origin}/token`,
          jwks_uri: `${url.origin}/jwks`,
        })
      if (url.pathname === "/jwks") return Response.json({ keys: [{ ...jwk, kid: "test", alg: "RS256" }] })
      if (url.pathname === "/authorize") {
        const redirect = url.searchParams.get("redirect_uri")
        const state = url.searchParams.get("state")
        return Response.redirect(`${redirect}?code=test-code&state=${state}`, 302)
      }
      if (url.pathname === "/token") {
        const token = await new SignJWT({ email, email_verified: true, nonce, name: "SSO User" })
          .setProtectedHeader({ alg: "RS256", kid: "test" })
          .setIssuer(url.origin)
          .setAudience("test-client")
          .setSubject("oidc-user")
          .setExpirationTime("5m")
          .sign(pair.privateKey)
        return Response.json({ id_token: token, access_token: "not-used", token_type: "Bearer" })
      }
      return new Response("not found", { status: 404 })
    },
  })

  const url = `http://127.0.0.1:${server.port}`
  return {
    url,
    setEmail(value) {
      email = value
    },
    setNonce(value) {
      nonce = value
    },
    close() {
      server.stop(true)
    },
  }
}

function cookie(response: Response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? ""
}

describe("SSO device approval", () => {
  let ctx: TestContext
  let oidc: MockOidc

  beforeEach(async () => {
    ctx = await setupContext()
    oidc = await mockOidc()
  })

  afterEach(async () => {
    oidc.close()
    await ctx.close()
  })

  async function configure(orgId: string) {
    const response = await ctx.app.request(`/api/v1/admin/orgs/${orgId}/sso`, {
      method: "PUT",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        issuer: oidc.url,
        clientId: "test-client",
        clientSecret: "test-secret",
        allowedDomains: ["test.internal"],
        groupClaim: "groups",
        groupRoles: { engineering: "member" },
      }),
    })
    expect(response.status).toBe(200)
  }

  test("signs in through the IdP and approves a device code", async () => {
    const { org } = await createTestOrg(ctx, {
      slug: "sso",
      name: "SSO Org",
      model: { id: "ballm-fast" },
    })
    await configure(org.id)

    const code = await ctx.app.request("/auth/device/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: "ballm-cli" }),
    })
    const device = (await code.json()) as { user_code: string; device_code: string }

    const approval = await ctx.app.request("/api/console/device/start", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:8787" },
      body: JSON.stringify({ userCode: device.user_code, email: "dev@test.internal" }),
    })
    expect(approval.status).toBe(200)
    expect(((await approval.json()) as { redirectUrl: string }).redirectUrl).toContain("/authorize")

    const state = await ctx.db.read<{ state: string; nonce: string }[]>`
      SELECT state, nonce FROM oidc_states ORDER BY created_at DESC LIMIT 1
    `
    expect(state[0]).toBeDefined()
    oidc.setNonce(state[0]!.nonce)

    const callback = await ctx.app.request(
      `/auth/sso/callback?code=test-code&state=${encodeURIComponent(state[0]!.state)}`,
    )
    expect(callback.status).toBe(302)
    expect(callback.headers.get("location")).toContain("/device/success")

    const issued = await ctx.app.request("/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: device.device_code,
      }),
    })
    expect(issued.status).toBe(200)
    const tokens = (await issued.json()) as { access_token: string }
    const user = await ctx.app.request("/api/user", { headers: { authorization: `Bearer ${tokens.access_token}` } })
    expect(((await user.json()) as { email: string }).email).toBe("dev@test.internal")
  })

  test("preserves a manually assigned role when no group mapping is configured", async () => {
    const { org } = await createTestOrg(ctx, { slug: "nomap", name: "No Mapping", model: { id: "ballm-fast" } })
    const response = await ctx.app.request(`/api/v1/admin/orgs/${org.id}/sso`, {
      method: "PUT",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        issuer: oidc.url,
        clientId: "test-client",
        clientSecret: "test-secret",
        allowedDomains: ["test.internal"],
      }),
    })
    expect(response.status).toBe(200)

    const owner = await findOrCreateUser(ctx.db.write, { email: "dev@test.internal" })
    await ensureMembership(ctx.db.write, owner.id, org.id, "owner")

    const start = await ctx.app.request("/auth/sso/nomap/start")
    expect(start.status).toBe(302)
    const state = await ctx.db.read<{ state: string; nonce: string }[]>`
      SELECT state, nonce FROM oidc_states ORDER BY created_at DESC LIMIT 1
    `
    oidc.setNonce(state[0]!.nonce)
    const callback = await ctx.app.request(
      `/auth/sso/callback?code=test-code&state=${encodeURIComponent(state[0]!.state)}`,
    )
    expect(callback.status).toBe(302)

    const membership = await ctx.db.read<{ role: string }[]>`
      SELECT role FROM memberships WHERE user_id = ${owner.id} AND org_id = ${org.id}
    `
    expect(membership[0]?.role).toBe("owner")
  })

  test("creates a browser session and rejects a disallowed email domain", async () => {
    const { org } = await createTestOrg(ctx, { slug: "sso", name: "SSO Org", model: { id: "ballm-fast" } })
    await configure(org.id)

    const start = await ctx.app.request("/auth/sso/sso/start")
    expect(start.status).toBe(302)
    let state = await ctx.db.read<{ state: string; nonce: string }[]>`
      SELECT state, nonce FROM oidc_states ORDER BY created_at DESC LIMIT 1
    `
    oidc.setNonce(state[0]!.nonce)
    const callback = await ctx.app.request(
      `/auth/sso/callback?code=test-code&state=${encodeURIComponent(state[0]!.state)}`,
    )
    expect(callback.status).toBe(302)
    const session = cookie(callback)
    expect(session).toContain("ballm_browser=")

    const me = await ctx.app.request("/auth/sso/me", { headers: { cookie: session } })
    expect(me.status).toBe(200)
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe("dev@test.internal")

    const second = await ctx.app.request("/auth/sso/sso/start")
    expect(second.status).toBe(302)
    state = await ctx.db.read<{ state: string; nonce: string }[]>`
      SELECT state, nonce FROM oidc_states ORDER BY created_at DESC LIMIT 1
    `
    oidc.setEmail("dev@other.example")
    oidc.setNonce(state[0]!.nonce)
    const denied = await ctx.app.request(
      `/auth/sso/callback?code=test-code&state=${encodeURIComponent(state[0]!.state)}`,
    )
    expect(denied.status).toBe(403)
  })
})

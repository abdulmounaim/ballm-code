import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createTestOrg, randomEmail, setupContext, type TestContext } from "./helpers"

describe("device flow", () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await setupContext()
  })

  afterEach(async () => {
    await ctx.close()
  })

  test("approves a device, rotates refresh tokens, and revokes the session", async () => {
    const { org } = await createTestOrg(ctx, {
      slug: "test",
      name: "Test Org",
      model: { id: "ballm-fast", upstreamModel: "upstream-fast" },
    })
    const email = randomEmail("device")

    const code = await ctx.app.request("/auth/device/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: "ballm-cli" }),
    })
    expect(code.status).toBe(200)
    const device = (await code.json()) as { device_code: string; user_code: string; verification_uri_complete: string }
    expect(device.verification_uri_complete).toContain(device.user_code)

    const pending = await ctx.app.request("/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: device.device_code,
      }),
    })
    expect(pending.status).toBe(400)
    expect(await pending.json()).toEqual({ error: "authorization_pending" })

    const login = await ctx.app.request("/auth/dev/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, org: "test", user_code: device.user_code }),
    })
    expect(login.status).toBe(200)

    const issued = await ctx.app.request("/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: device.device_code,
      }),
    })
    expect(issued.status).toBe(200)
    const tokens = (await issued.json()) as { access_token: string; refresh_token: string; org_id: string }
    expect(tokens.org_id).toBe(org.id)

    const user = await ctx.app.request("/api/user", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    })
    expect(user.status).toBe(200)
    expect(((await user.json()) as { email: string }).email).toBe(email)

    const config = await ctx.app.request("/api/v2/config", {
      headers: { authorization: `Bearer ${tokens.access_token}`, "x-org-id": org.id },
    })
    expect(config.status).toBe(200)
    const remote = (await config.json()) as {
      providers: { ballm: { settings: { baseURL: string }; models: Record<string, unknown> } }
      policies: unknown[]
    }
    expect(remote.providers.ballm.settings.baseURL).toBe("http://localhost:8788/v1")
    expect(remote.providers.ballm.models["ballm-fast"]).toBeDefined()
    expect(remote.policies.length).toBeGreaterThan(0)

    const rotated = await ctx.app.request("/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }),
    })
    expect(rotated.status).toBe(200)
    const next = (await rotated.json()) as { access_token: string; refresh_token: string }

    const reuse = await ctx.app.request("/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }),
    })
    expect(reuse.status).toBe(400)

    const afterReuse = await ctx.app.request("/api/user", {
      headers: { authorization: `Bearer ${next.access_token}` },
    })
    expect(afterReuse.status).toBe(401)

    const second = await ctx.app.request("/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: next.refresh_token }),
    })
    expect(second.status).toBe(400)
  })

  test("rejects a code without approval and an expired refresh token", async () => {
    const code = await ctx.app.request("/auth/device/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: "ballm-cli" }),
    })
    const device = (await code.json()) as { device_code: string }
    const pending = await ctx.app.request("/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: device.device_code,
      }),
    })
    expect(pending.status).toBe(400)

    const invalid = await ctx.app.request("/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: "unknown" }),
    })
    expect(invalid.status).toBe(400)
  })
})

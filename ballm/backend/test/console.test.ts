import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  addOrgMember,
  createBrowserSession,
  createSession,
  ensureMembership,
} from "../services/control-plane/src/store"
import { adminToken, createTestOrg, setupContext, type TestContext } from "./helpers"

const ORIGIN = "http://localhost:8787"

function headers(cookie: string, csrf?: string, extra: Record<string, string> = {}) {
  return {
    cookie: `ballm_browser=${encodeURIComponent(cookie)}`,
    origin: ORIGIN,
    ...(csrf ? { "x-ballm-csrf": csrf } : {}),
    ...extra,
  }
}

async function ownerSession(ctx: TestContext, orgId: string, userId: string) {
  const browser = await createBrowserSession(ctx.db.write, { userId, orgId, ttlSeconds: 3600 })
  const session = await ctx.app.request("/api/console/session", { headers: headers(browser.cookie) })
  const payload = (await session.json()) as { csrf: string; capabilities: { manageOwners: boolean } }
  return { cookie: browser.cookie, csrf: payload.csrf, payload }
}

describe("console API", () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await setupContext()
  })

  afterEach(async () => {
    await ctx.close()
  })

  test("requires a browser session and a CSRF token for mutations", async () => {
    const { org, user } = await createTestOrg(ctx, { slug: "console", name: "Console" })

    const anonymous = await ctx.app.request("/api/console/session")
    expect(anonymous.status).toBe(401)

    const { cookie, csrf, payload } = await ownerSession(ctx, org.id, user.id)
    expect(payload.csrf).toBe(csrf)
    expect(payload.capabilities.manageOwners).toBe(true)

    const noToken = await ctx.app.request("/api/console/members", {
      ...json("member@test.internal"),
      headers: headers(cookie),
    })
    expect(noToken.status).toBe(403)
    expect(((await noToken.json()) as { error: string }).error).toBe("csrf_failed")

    const wrongOrigin = await ctx.app.request("/api/console/members", {
      ...json("member@test.internal"),
      headers: headers(cookie, csrf, { origin: "https://evil.example" }),
    })
    expect(wrongOrigin.status).toBe(403)
    expect(((await wrongOrigin.json()) as { error: string }).error).toBe("forbidden_origin")

    const created = await ctx.app.request("/api/console/members", {
      ...json("member@test.internal"),
      headers: headers(cookie, csrf),
    })
    expect(created.status).toBe(201)

    // A proxy or DNS alias that is not the canonical public URL still works when Origin matches
    // the host the request actually arrived on.
    const alias = await ctx.app.request("http://127.0.0.1:8787/api/console/members", {
      ...json("alias@test.internal"),
      headers: headers(cookie, csrf, { origin: "http://127.0.0.1:8787" }),
    })
    expect(alias.status).toBe(201)

    // A CSRF token is bound to one browser session.
    const other = await createBrowserSession(ctx.db.write, { userId: user.id, orgId: org.id, ttlSeconds: 3600 })
    const cross = await ctx.app.request("/api/console/members", {
      ...json("cross@test.internal"),
      headers: headers(other.cookie, csrf),
    })
    expect(cross.status).toBe(403)
    expect(((await cross.json()) as { error: string }).error).toBe("csrf_failed")
  })

  test("revokes the browser session on logout", async () => {
    const { org, user } = await createTestOrg(ctx, { slug: "logout", name: "Logout" })
    const { cookie, csrf } = await ownerSession(ctx, org.id, user.id)
    const logout = await ctx.app.request("/api/console/logout", {
      method: "POST",
      headers: headers(cookie, csrf),
    })
    expect(logout.status).toBe(200)
    expect((await ctx.app.request("/api/console/session", { headers: headers(cookie) })).status).toBe(401)

    const stored = await ctx.db.read<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM browser_sessions WHERE user_id = ${user.id}
    `
    expect(stored[0]?.revoked_at).not.toBeNull()
  })

  test("enforces role permissions and protects the last owner", async () => {
    const { org, user } = await createTestOrg(ctx, { slug: "rbac", name: "RBAC" })
    const member = await addOrgMember(ctx.db.write, {
      orgId: org.id,
      email: "member@test.internal",
      role: "member",
    })
    const admin = await addOrgMember(ctx.db.write, {
      orgId: org.id,
      email: "admin@test.internal",
      role: "admin",
    })

    const memberBrowser = await createBrowserSession(ctx.db.write, {
      userId: member.id,
      orgId: org.id,
      ttlSeconds: 3600,
    })
    expect(
      (await ctx.app.request("/api/console/members", { headers: headers(memberBrowser.cookie) })).status,
    ).toBe(403)
    expect((await ctx.app.request("/api/console/me", { headers: headers(memberBrowser.cookie) })).status).toBe(200)

    const adminBrowser = await createBrowserSession(ctx.db.write, {
      userId: admin.id,
      orgId: org.id,
      ttlSeconds: 3600,
    })
    const adminSession = await ctx.app.request("/api/console/session", { headers: headers(adminBrowser.cookie) })
    const adminPayload = (await adminSession.json()) as { csrf: string }

    const promote = await ctx.app.request(`/api/console/members/${admin.id}`, {
      method: "PATCH",
      headers: headers(adminBrowser.cookie, adminPayload.csrf),
      body: JSON.stringify({ role: "owner" }),
    })
    expect(promote.status).toBe(403)

    const demoteOwner = await ctx.app.request(`/api/console/members/${user.id}`, {
      method: "PATCH",
      headers: headers(adminBrowser.cookie, adminPayload.csrf),
      body: JSON.stringify({ role: "member" }),
    })
    expect(demoteOwner.status).toBe(403)

    const { cookie, csrf } = await ownerSession(ctx, org.id, user.id)
    const lastOwner = await ctx.app.request(`/api/console/members/${user.id}`, {
      method: "PATCH",
      headers: headers(cookie, csrf),
      body: JSON.stringify({ role: "admin" }),
    })
    expect(lastOwner.status).toBe(409)

    const removeLastOwner = await ctx.app.request(`/api/console/members/${user.id}`, {
      method: "DELETE",
      headers: headers(cookie, csrf),
    })
    expect(removeLastOwner.status).toBe(409)

    const removeMember = await ctx.app.request(`/api/console/members/${member.id}`, {
      method: "DELETE",
      headers: headers(cookie, csrf),
    })
    expect(removeMember.status).toBe(200)
    expect((await ctx.app.request("/api/console/me", { headers: headers(memberBrowser.cookie) })).status).toBe(403)
  })

  test("manages models, policies, SSO secrets, and upstream credentials", async () => {
    const { org, user } = await createTestOrg(ctx, { slug: "manage", name: "Manage" })
    const { cookie, csrf } = await ownerSession(ctx, org.id, user.id)
    const auth = headers(cookie, csrf)

    const model = await ctx.app.request("/api/console/models/ballm-reasoning", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({
        id: "ballm-reasoning",
        name: "Ballm Reasoning",
        upstreamModel: "reasoning-v1",
        contextLimit: 200000,
      }),
    })
    expect(model.status).toBe(200)

    const unknown = await ctx.app.request("/api/console/models", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ modelIds: ["ballm-fast", "missing"] }),
    })
    expect(unknown.status).toBe(400)

    const allowlist = await ctx.app.request("/api/console/models", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ modelIds: ["ballm-reasoning"] }),
    })
    expect(allowlist.status).toBe(200)

    const catalog = (await (await ctx.app.request("/api/console/models", { headers: auth })).json()) as {
      models: Array<{ id: string; org_enabled: boolean }>
    }
    expect(catalog.models.find((entry) => entry.id === "ballm-reasoning")?.org_enabled).toBe(true)

    const policies = await ctx.app.request("/api/console/policies", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({
        statements: [
          { action: "provider.use", resource: "*", effect: "deny" },
          { action: "provider.use", resource: "ballm", effect: "allow" },
        ],
      }),
    })
    expect(policies.status).toBe(200)

    const sso = await ctx.app.request("/api/console/sso", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({
        issuer: "https://idp.test/",
        clientId: "console-client",
        clientSecret: "super-secret",
        allowedDomains: ["test.internal"],
        groupClaim: "groups",
        groupRoles: { engineering: "member" },
      }),
    })
    expect(sso.status).toBe(200)

    const ssoRead = (await (await ctx.app.request("/api/console/sso", { headers: auth })).json()) as Record<
      string,
      unknown
    >
    expect(ssoRead.configured).toBe(true)
    expect(ssoRead.hasClientSecret).toBe(true)
    expect(ssoRead.issuer).toBe("https://idp.test")
    expect(ssoRead.encryptedClientSecret).toBeUndefined()

    const stored = await ctx.db.read<{ encrypted_client_secret: string }[]>`
      SELECT encrypted_client_secret FROM sso_connections WHERE org_id = ${org.id}
    `
    expect(stored[0]?.encrypted_client_secret.startsWith("v1.")).toBe(true)
    expect(stored[0]?.encrypted_client_secret).not.toContain("super-secret")

    const upstream = await ctx.app.request("/api/console/upstream", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ baseUrl: "https://upstream.test/v1", apiKey: "upstream-key" }),
    })
    expect(upstream.status).toBe(200)

    const upstreamRead = (await (await ctx.app.request("/api/console/upstream", { headers: auth })).json()) as {
      hasApiKey: boolean
      baseUrl: string
    }
    expect(upstreamRead.hasApiKey).toBe(true)
    expect(upstreamRead.baseUrl).toBe("https://upstream.test/v1")

    const clearKey = await ctx.app.request("/api/console/upstream", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ apiKey: null }),
    })
    expect(clearKey.status).toBe(200)
    expect(
      ((await (await ctx.app.request("/api/console/upstream", { headers: auth })).json()) as { hasApiKey: boolean })
        .hasApiKey,
    ).toBe(false)

    const audit = (await (await ctx.app.request("/api/console/audit", { headers: auth })).json()) as {
      events: Array<{ kind: string }>
    }
    expect(audit.events.some((event) => event.kind === "console.sso.update")).toBe(true)
    expect(audit.events.some((event) => event.kind === "console.policy.update")).toBe(true)
  })

  test("tests the upstream connection without exposing the key", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        if (new URL(request.url).pathname === "/models" && request.headers.get("authorization") === "Bearer upstream-key")
          return Response.json({ object: "list", data: [] })
        return new Response("nope", { status: 401 })
      },
    })
    try {
      const { org, user } = await createTestOrg(ctx, { slug: "probe", name: "Probe" })
      const { cookie, csrf } = await ownerSession(ctx, org.id, user.id)
      const auth = headers(cookie, csrf)

      await ctx.app.request("/api/console/upstream", {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({ baseUrl: `http://127.0.0.1:${server.port}`, apiKey: "upstream-key" }),
      })

      const result = (await (await ctx.app.request("/api/console/upstream/test", { method: "POST", headers: auth })).json()) as {
        ok: boolean
        status: number
        latencyMs: number
      }
      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    } finally {
      server.stop(true)
    }
  })

  test("lists and revokes sessions with role checks", async () => {
    const { org, user } = await createTestOrg(ctx, { slug: "sessions", name: "Sessions" })
    const member = await addOrgMember(ctx.db.write, {
      orgId: org.id,
      email: "device@test.internal",
      role: "member",
    })
    const memberSession = await createSession(ctx.db.write, {
      userId: member.id,
      orgId: org.id,
      method: "device",
      userAgent: "BallmCLI/1.0 Chrome/120",
    })
    const { cookie, csrf } = await ownerSession(ctx, org.id, user.id)
    const auth = headers(cookie, csrf)

    const list = (await (await ctx.app.request("/api/console/sessions", { headers: auth })).json()) as {
      sessions: Array<{ id: string; role: string; email: string }>
    }
    expect(list.sessions.some((session) => session.id === memberSession && session.role === "member")).toBe(true)

    const revoke = await ctx.app.request(`/api/console/sessions/${memberSession}`, {
      method: "DELETE",
      headers: auth,
    })
    expect(revoke.status).toBe(200)

    const after = (await (await ctx.app.request("/api/console/sessions", { headers: auth })).json()) as {
      sessions: Array<{ id: string }>
    }
    expect(after.sessions.some((session) => session.id === memberSession)).toBe(false)
  })

  test("approves a device from the console", async () => {
    const { org, user } = await createTestOrg(ctx, { slug: "device", name: "Device" })
    await ensureMembership(ctx.db.write, user.id, org.id, "owner")
    const { cookie, csrf } = await ownerSession(ctx, org.id, user.id)
    const auth = headers(cookie, csrf)

    const code = await ctx.app.request("/auth/device/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: "ballm-cli" }),
    })
    const device = (await code.json()) as { user_code: string; device_code: string; verification_uri_complete: string }
    expect(device.verification_uri_complete).toContain("/console/device?user_code=")

    const state = (await (await ctx.app.request(`/api/console/device?user_code=${device.user_code}`, { headers: auth })).json()) as {
      signedIn: boolean
      codeStatus: string
    }
    expect(state.signedIn).toBe(true)
    expect(state.codeStatus).toBe("pending")

    const denied = await ctx.app.request("/api/console/device/approve", {
      method: "POST",
      headers: headers(cookie),
      body: JSON.stringify({ userCode: device.user_code }),
    })
    expect(denied.status).toBe(403)

    const approve = await ctx.app.request("/api/console/device/approve", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ userCode: device.user_code }),
    })
    expect(approve.status).toBe(200)

    const token = await ctx.app.request("/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: device.device_code,
      }),
    })
    expect(token.status).toBe(200)
    expect(((await token.json()) as { org_id: string }).org_id).toBe(org.id)
  })

  test("rejects sign-in for an unknown email domain", async () => {
    const response = await ctx.app.request("/api/console/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email: "dev@nowhere.example" }),
    })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toBe("sso_not_configured")
  })

  test("does not accept an admin token on console routes", async () => {
    const response = await ctx.app.request("/api/console/members", {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(response.status).toBe(401)
  })
})

describe("console static files", () => {
  let ctx: TestContext
  let directory: string
  const previous = process.env.BALLM_CONSOLE_DIR

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "ballm-console-"))
    await writeFile(path.join(directory, "index.html"), "<!doctype html><title>Console shell</title>")
    await mkdir(path.join(directory, "assets"))
    await writeFile(path.join(directory, "assets", "app.js"), "console.log('console')")
    process.env.BALLM_CONSOLE_DIR = directory
  })

  afterAll(async () => {
    if (previous === undefined) delete process.env.BALLM_CONSOLE_DIR
    else process.env.BALLM_CONSOLE_DIR = previous
    await rm(directory, { recursive: true, force: true })
  })

  beforeEach(async () => {
    ctx = await setupContext()
  })

  afterEach(async () => {
    await ctx.close()
  })

  test("serves the shell, immutable assets, and a strict CSP", async () => {
    const shell = await ctx.app.request("/console/")
    expect(shell.status).toBe(200)
    expect(await shell.text()).toContain("Console shell")
    expect(shell.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
    expect(shell.headers.get("x-frame-options")).toBe("DENY")
    expect(shell.headers.get("cache-control")).toBe("no-cache")

    const asset = await ctx.app.request("/console/assets/app.js")
    expect(asset.status).toBe(200)
    expect(asset.headers.get("cache-control")).toContain("immutable")

    const fallback = await ctx.app.request("/console/members")
    expect(await fallback.text()).toContain("Console shell")

    const namedIndex = await ctx.app.request("/console/index.html")
    expect(namedIndex.headers.get("cache-control")).toBe("no-cache")

    const redirect = await ctx.app.request("/console")
    expect(redirect.status).toBe(308)

    const traversal = await ctx.app.request("/console/%2e%2e/%2e%2e/etc/passwd")
    expect(traversal.status).toBe(404)
  })
})

describe("console device redirects", () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await setupContext()
  })

  afterEach(async () => {
    await ctx.close()
  })

  test("keeps the legacy device URL working", async () => {
    const response = await ctx.app.request("/device?user_code=ABCD-EFGH")
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/console/device?user_code=ABCD-EFGH")
  })
})

function json(body: string) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: body, role: "member" }),
  }
}

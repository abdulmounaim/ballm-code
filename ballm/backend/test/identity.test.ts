import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createBrowserSession, ensureMembership, findOrCreateUser } from "../services/control-plane/src/store"
import { createTestOrg, setupContext, type TestContext } from "./helpers"

let kratos: ReturnType<typeof Bun.serve>
let ctx: TestContext

const verifiedSession = {
  id: "sess_kratos",
  active: true,
  identity: {
    id: "ident_verified",
    traits: { email: "person@baytai.io", name: "Person" },
    verifiable_addresses: [{ value: "person@baytai.io", verified: true, status: "completed" }],
  },
}

function sessionFor(cookie: string | undefined) {
  if (!cookie?.includes("ory_kratos_session=verified")) return undefined
  return verifiedSession
}

beforeAll(async () => {
  kratos = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/sessions/whoami") {
        const session = sessionFor(request.headers.get("cookie") ?? undefined)
        if (!session) return Response.json({ error: { id: "session_invalid" } }, { status: 401 })
        return Response.json(session)
      }
      if (url.pathname === "/self-service/login/browser") {
        return new Response(null, {
          status: 302,
          headers: {
            location: `/console/login?flow=flow_1&return_to=${encodeURIComponent(url.searchParams.get("return_to") ?? "")}`,
            "set-cookie": "ory_kratos_session=verified; Path=/; HttpOnly; SameSite=Lax",
          },
        })
      }
      if (url.pathname === "/self-service/registration" && request.method === "POST") {
        const body = await request.text()
        return Response.json({ received: body })
      }
      return Response.json({ ok: true, path: url.pathname, query: url.search })
    },
  })
  ctx = await setupContext({
    BALLM_KRATOS_PUBLIC_URL: `http://127.0.0.1:${kratos.port}`,
    BALLM_SIGNUP_ENABLED: true,
    identityEnabled: true,
  })
})

afterAll(async () => {
  await ctx?.close()
  kratos?.stop(true)
})

describe("identity configuration", () => {
  test("reports which sign-in methods are available", async () => {
    const response = await ctx.app.request("/auth/config")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ password: { enabled: true }, signup: true, sso: true })
  })

  test("proxies hosted identity flows on the console origin", async () => {
    const response = await ctx.app.request("/self-service/login/browser?return_to=%2Fauth%2Fpassword%2Fcomplete")
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toContain("/console/login?flow=flow_1")
    expect(response.headers.getSetCookie()).toHaveLength(1)
    expect(response.headers.getSetCookie()[0]).toContain("ory_kratos_session=verified")
  })

  test("forwards form bodies to the identity service", async () => {
    const response = await ctx.app.request("/self-service/registration", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "traits.email=person%40baytai.io&method=profile",
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: "traits.email=person%40baytai.io&method=profile" })
  })
})

describe("password sign-in", () => {
  test("creates a person, a personal workspace, and a browser session", async () => {
    const response = await ctx.app.request("/auth/password/complete", {
      headers: { cookie: "ory_kratos_session=verified" },
    })
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/console/")
    const cookie = response.headers.getSetCookie()[0]?.split(";")[0]
    expect(cookie).toContain("ballm_browser=")

    const session = await ctx.app.request("/api/console/session", { headers: { cookie: cookie! } })
    expect(session.status).toBe(200)
    const body = (await session.json()) as {
      org: { kind: string; name: string }
      auth: { password: boolean; emailVerifiedAt: string | null }
      orgs: Array<{ kind: string }>
    }
    expect(body.org.kind).toBe("personal")
    expect(body.orgs.map((org) => org.kind)).toContain("personal")
    expect(body.auth.password).toBe(true)
    expect(body.auth.emailVerifiedAt).not.toBeNull()

    const rows = await ctx.db.write<{ identity_id: string }[]>`
      SELECT identity_id FROM users WHERE lower(email) = 'person@baytai.io'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]!.identity_id).toBe("ident_verified")

    const orgs = await ctx.db.write<{ count: number }[]>`
      SELECT count(*)::int AS count FROM orgs WHERE kind = 'personal' AND created_by = (
        SELECT id FROM users WHERE lower(email) = 'person@baytai.io'
      )
    `
    expect(orgs[0]!.count).toBe(1)
  })

  test("is idempotent for the same identity", async () => {
    const response = await ctx.app.request("/auth/password/complete", {
      headers: { cookie: "ory_kratos_session=verified" },
    })
    const cookie = response.headers.getSetCookie()[0]?.split(";")[0]
    expect(cookie).toBeDefined()
    const users = await ctx.db.write<{ count: number }[]>`
      SELECT count(*)::int AS count FROM users WHERE lower(email) = 'person@baytai.io'
    `
    expect(users[0]!.count).toBe(1)
    const personal = await ctx.db.write<{ count: number }[]>`
      SELECT count(*)::int AS count FROM orgs WHERE kind = 'personal' AND created_by = (
        SELECT id FROM users WHERE lower(email) = 'person@baytai.io'
      )
    `
    expect(personal[0]!.count).toBe(1)
  })

  test("refuses to issue a session without a verified address", async () => {
    const response = await ctx.app.request("/auth/password/complete")
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toContain("/console/?auth=expired")
  })

  test("approves a device code through the password flow", async () => {
    const start = await ctx.app.request("/auth/device/code", { method: "POST" })
    const device = (await start.json()) as { device_code: string; user_code: string }

    const begin = await ctx.app.request(`/auth/password/login?user_code=${device.user_code}`)
    expect(begin.status).toBe(302)
    const redirect = begin.headers.get("location") ?? ""
    const returnTo = new URL(redirect, "http://localhost").searchParams.get("return_to") ?? ""
    const state = new URL(returnTo).searchParams.get("state")
    expect(state).toBeTruthy()

    const complete = await ctx.app.request(`/auth/password/complete?state=${state}`, {
      headers: { cookie: "ory_kratos_session=verified" },
    })
    expect(complete.status).toBe(302)
    expect(complete.headers.get("location")).toContain("/console/device/success")

    const token = await ctx.app.request("/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: device.device_code }),
    })
    expect(token.status).toBe(200)
    expect(await token.json()).toMatchObject({ access_token: expect.any(String), refresh_token: expect.any(String) })
  })

  test("rejects registration when sign-up is closed", async () => {
    const closed = await setupContext({
      BALLM_KRATOS_PUBLIC_URL: `http://127.0.0.1:${kratos.port}`,
      BALLM_SIGNUP_ENABLED: false,
      identityEnabled: true,
    })
    try {
      const response = await closed.app.request("/auth/password/register")
      expect(response.status).toBe(403)
      const config = await closed.app.request("/auth/config")
      expect(await config.json()).toMatchObject({ signup: false })
    } finally {
      await closed.close()
    }
  })
})

describe("invitations", () => {
  async function browserCookie(email: string, orgId: string, role?: "owner" | "admin" | "member") {
    const user = await findOrCreateUser(ctx.db.write, { email })
    if (role) await ensureMembership(ctx.db.write, user.id, orgId, role)
    const browser = await createBrowserSession(ctx.db.write, {
      userId: user.id,
      orgId,
      ttlSeconds: 3_600,
    })
    return { cookie: `ballm_browser=${browser.cookie}`, user }
  }

  test("invites an address, then accepts once for the matching account", async () => {
    const { org } = await createTestOrg(ctx, { slug: "acme", name: "Acme" })
    const owner = await browserCookie("owner@acme.test", org.id, "owner")
    const csrf = (await (
      await ctx.app.request("/api/console/session", { headers: { cookie: owner.cookie } })
    ).json()) as { csrf: string }

    const created = await ctx.app.request("/api/console/invites", {
      method: "POST",
      headers: {
        cookie: owner.cookie,
        "content-type": "application/json",
        "x-ballm-csrf": csrf.csrf,
        origin: "http://localhost:8787",
      },
      body: JSON.stringify({ email: "invitee@acme.test", role: "admin" }),
    })
    expect(created.status).toBe(201)
    const body = (await created.json()) as { link: string; delivered: boolean; invite: { id: string } }
    expect(body.delivered).toBe(false)
    const token = new URL(body.link).searchParams.get("token")
    expect(token).toBeTruthy()

    const invited = await browserCookie("invitee@acme.test", org.id)
    const accepted = await ctx.app.request("/auth/invite/accept", {
      method: "POST",
      headers: {
        cookie: invited.cookie,
        "content-type": "application/json",
        origin: "http://localhost:8787",
      },
      body: JSON.stringify({ token }),
    })
    expect(accepted.status).toBe(200)
    const membership = await ctx.db.write<{ role: string }[]>`
      SELECT role FROM memberships WHERE org_id = ${org.id} AND user_id = ${invited.user.id}
    `
    expect(membership[0]?.role).toBe("admin")

    const replay = await ctx.app.request("/auth/invite/accept", {
      method: "POST",
      headers: {
        cookie: invited.cookie,
        "content-type": "application/json",
        origin: "http://localhost:8787",
      },
      body: JSON.stringify({ token }),
    })
    expect(replay.status).toBe(404)
  })

  test("rejects an invitation opened by a different account", async () => {
    const { org } = await createTestOrg(ctx, { slug: "beta", name: "Beta" })
    const owner = await browserCookie("owner@beta.test", org.id, "owner")
    const csrf = (await (
      await ctx.app.request("/api/console/session", { headers: { cookie: owner.cookie } })
    ).json()) as { csrf: string }
    const created = await ctx.app.request("/api/console/invites", {
      method: "POST",
      headers: {
        cookie: owner.cookie,
        "content-type": "application/json",
        "x-ballm-csrf": csrf.csrf,
        origin: "http://localhost:8787",
      },
      body: JSON.stringify({ email: "wanted@beta.test", role: "member" }),
    })
    const { link } = (await created.json()) as { link: string }
    const token = new URL(link).searchParams.get("token")

    const other = await browserCookie("someone-else@beta.test", org.id)
    const response = await ctx.app.request("/auth/invite/accept", {
      method: "POST",
      headers: {
        cookie: other.cookie,
        "content-type": "application/json",
        origin: "http://localhost:8787",
      },
      body: JSON.stringify({ token }),
    })
    expect(response.status).toBe(403)
  })
})

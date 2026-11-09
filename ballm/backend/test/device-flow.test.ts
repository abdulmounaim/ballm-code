import { describe, expect, test } from "bun:test"
import { createApp } from "../src/app.js"
import type { ServerConfig } from "../src/env.js"
import { open } from "../src/store/db.js"

const config: ServerConfig = {
  port: 0,
  publicUrl: "http://localhost:8787",
  db: ":memory:",
  orgID: "org_local",
  orgName: "Local",
  models: [{ id: "ballm-fast", name: "Ballm Fast" }],
  upstreamBaseUrl: undefined,
  upstreamApiKey: undefined,
  devEcho: true,
  allowDevApprove: true,
  accessTtl: 3600,
  refreshTtl: 2_592_000,
}

function setup() {
  const db = open(":memory:")
  return { db, app: createApp(db, config) }
}

async function post(app: ReturnType<typeof setup>["app"], path: string, body: unknown, token?: string) {
  return app.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe("device flow", () => {
  test("issues tokens only after approval and rotates refresh tokens", async () => {
    const { app } = setup()

    const code = await post(app, "/auth/device/code", { client_id: "ballm-cli" })
    expect(code.status).toBe(200)
    const device = (await code.json()) as { device_code: string; user_code: string; verification_uri_complete: string }
    expect(device.verification_uri_complete).toContain(device.user_code)

    const pending = await post(app, "/auth/device/token", {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: device.device_code,
      client_id: "ballm-cli",
    })
    expect(pending.status).toBe(400)
    expect(await pending.json()).toEqual({ error: "authorization_pending" })

    const approve = await post(app, "/auth/device/approve", {
      user_code: device.user_code,
      email: "dev@ballm.internal",
    })
    expect(approve.status).toBe(200)

    const issued = await post(app, "/auth/device/token", {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: device.device_code,
      client_id: "ballm-cli",
    })
    expect(issued.status).toBe(200)
    const tokens = (await issued.json()) as { access_token: string; refresh_token: string; org_id: string }
    expect(tokens.org_id).toBe("org_local")

    const user = await app.request("/api/user", { headers: { authorization: `Bearer ${tokens.access_token}` } })
    expect(await user.json()).toEqual({ id: expect.any(String), email: "dev@ballm.internal" })

    const configResponse = await app.request("/api/v2/config", {
      headers: { authorization: `Bearer ${tokens.access_token}`, "x-org-id": "org_local" },
    })
    expect(configResponse.status).toBe(200)
    const remote = (await configResponse.json()) as {
      providers: { ballm: { settings: { baseURL: string }; models: Record<string, unknown> } }
      policies: unknown[]
    }
    expect(remote.providers.ballm.settings.baseURL).toBe("http://localhost:8787/v1")
    expect(remote.providers.ballm.models["ballm-fast"]).toBeDefined()
    expect(remote.policies.length).toBeGreaterThan(0)

    const models = await app.request("/v1/models", { headers: { authorization: `Bearer ${tokens.access_token}` } })
    expect(models.status).toBe(200)
    const list = (await models.json()) as { data: { id: string }[] }
    expect(list.data.map((item) => item.id)).toEqual(["ballm-fast"])

    const completion = await post(
      app,
      "/v1/chat/completions",
      { model: "ballm-fast", messages: [] },
      tokens.access_token,
    )
    expect(completion.status).toBe(200)
    const body = (await completion.json()) as { choices: { message: { content: string } }[] }
    expect(body.choices[0]?.message.content).toContain("Ballm dev echo")

    const stream = await post(
      app,
      "/v1/chat/completions",
      { model: "ballm-fast", messages: [], stream: true },
      tokens.access_token,
    )
    expect(stream.status).toBe(200)
    expect(stream.headers.get("content-type")).toContain("text/event-stream")
    expect(await stream.text()).toContain("data: [DONE]")

    const blocked = await post(app, "/v1/chat/completions", { model: "unknown-model" }, tokens.access_token)
    expect(blocked.status).toBe(403)

    const rotated = await post(app, "/auth/device/token", {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: "ballm-cli",
    })
    expect(rotated.status).toBe(200)
    const next = (await rotated.json()) as { access_token: string; refresh_token: string }

    const reuse = await post(app, "/auth/device/token", {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    })
    expect(reuse.status).toBe(400)

    const revoke = await post(app, "/auth/device/revoke", { token: next.access_token })
    expect(revoke.status).toBe(200)
    const denied = await app.request("/api/v2/config", {
      headers: { authorization: `Bearer ${next.access_token}` },
    })
    expect(denied.status).toBe(401)
  })
})

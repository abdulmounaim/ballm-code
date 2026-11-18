import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { signAccessToken } from "@ballm/platform/auth"
import { createSession, setOrgSettings } from "../services/control-plane/src/store"
import { createTestOrg, randomEmail, setupContext, type TestContext } from "./helpers"

interface Captured {
  body?: Record<string, unknown>
  headers: Headers
  path: string
}

describe("gateway", () => {
  let ctx: TestContext
  let upstream: ReturnType<typeof Bun.serve>
  let captured: Captured | undefined

  beforeEach(async () => {
    ctx = await setupContext()
    captured = undefined
    upstream = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        const text = await request.text()
        let body: Record<string, unknown> | undefined
        try {
          body = JSON.parse(text) as Record<string, unknown>
        } catch {
          body = undefined
        }
        captured = { body, headers: request.headers, path: url.pathname }
        if (body?.stream === true) {
          const chunks = [
            `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "hello" } }] })}\n\n`,
            `data: ${JSON.stringify({ usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } })}\n\n`,
            "data: [DONE]\n\n",
          ]
          return new Response(chunks.join(""), {
            headers: { "content-type": "text/event-stream" },
          })
        }
        return Response.json({
          id: "chatcmpl_test",
          object: "chat.completion",
          model: body?.model,
          choices: [{ index: 0, message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 },
        })
      },
    })
  })

  afterEach(async () => {
    upstream.stop(true)
    await ctx.close()
  })

  async function sessionToken(orgId: string, userId: string) {
    const sessionId = await createSession(ctx.db.write, { userId, orgId, method: "dev" })
    const token = await signAccessToken(ctx.keys, { userId, orgId, sessionId, ttl: 60 })
    return { sessionId, token }
  }

  test("routes to the org upstream, rewrites the model, and records usage", async () => {
    const { org, user } = await createTestOrg(ctx, {
      slug: "gateway",
      name: "Gateway",
      email: randomEmail("gateway"),
      model: { id: "ballm-fast", upstreamModel: "upstream-fast" },
    })
    await setOrgSettings(ctx.db.write, {
      orgId: org.id,
      upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      encryptedUpstreamApiKey: ctx.secrets.seal("upstream-key"),
    })
    await ctx.catalog.invalidate(org.id)
    const { token, sessionId } = await sessionToken(org.id, user.id)

    const models = await ctx.gateway.request("/v1/models", { headers: { authorization: `Bearer ${token}` } })
    expect(models.status).toBe(200)
    expect(await models.json()).toEqual({
      object: "list",
      data: [{ id: "ballm-fast", object: "model", created: 0, owned_by: "ballm" }],
    })

    const response = await ctx.gateway.request("/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "ballm-fast", messages: [{ role: "user", content: "hi" }] }),
    })
    expect(response.status).toBe(200)
    expect(captured?.path).toBe("/chat/completions")
    expect(captured?.body?.model).toBe("upstream-fast")
    expect(captured?.headers.get("authorization")).toBe("Bearer upstream-key")

    await ctx.usage.flush()
    const usage = await ctx.db.read<{ prompt_tokens: number; completion_tokens: number; total_tokens: number }[]>`
      SELECT prompt_tokens, completion_tokens, total_tokens FROM usage_events WHERE org_id = ${org.id}
    `
    expect(usage).toHaveLength(1)
    expect(usage[0]).toEqual({ prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 })

    const stream = await ctx.gateway.request("/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "ballm-fast", stream: true, messages: [] }),
    })
    expect(stream.status).toBe(200)
    expect(await stream.text()).toContain("data: [DONE]")
    await ctx.usage.flush()
    const streamed = await ctx.db.read<{ prompt_tokens: number }[]>`
      SELECT prompt_tokens FROM usage_events WHERE org_id = ${org.id} ORDER BY id
    `
    expect(streamed).toHaveLength(2)
    expect(streamed[1]?.prompt_tokens).toBe(3)

    const blocked = await ctx.gateway.request("/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "other", messages: [] }),
    })
    expect(blocked.status).toBe(403)

    await ctx.cache.set(`ballm:revoked:${sessionId}`, "1", 60)
    const revoked = await ctx.gateway.request("/v1/models", { headers: { authorization: `Bearer ${token}` } })
    expect(revoked.status).toBe(401)
  })

  test("rejects a token for a different org that has no catalog", async () => {
    const first = await createTestOrg(ctx, {
      slug: "first",
      name: "First",
      model: { id: "ballm-fast", upstreamModel: "upstream-fast" },
    })
    const second = await createTestOrg(ctx, { slug: "second", name: "Second" })
    const { token } = await sessionToken(second.org.id, second.user.id)
    const response = await ctx.gateway.request("/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "ballm-fast", messages: [] }),
    })
    expect(response.status).toBe(403)
    expect(first.org.id).not.toBe(second.org.id)
  })
})

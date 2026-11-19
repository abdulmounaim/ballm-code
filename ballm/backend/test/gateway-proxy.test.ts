import { afterEach, describe, expect, test } from "bun:test"
import { setupContext, type TestContext } from "./helpers"

interface Captured {
  path: string
  authorization: string | null
  body: string
}

describe("control-plane /v1 proxy", () => {
  let ctx: TestContext | undefined
  let upstream: ReturnType<typeof Bun.serve> | undefined

  afterEach(async () => {
    upstream?.stop(true)
    await ctx?.close()
    upstream = undefined
    ctx = undefined
  })

  test("forwards to the internal gateway and streams the response", async () => {
    let captured: Captured | undefined
    upstream = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        captured = {
          path: url.pathname,
          authorization: request.headers.get("authorization"),
          body: await request.text(),
        }
        if (url.pathname.endsWith("/chat/completions"))
          return new Response('data: {"usage":{"total_tokens":3}}\n\ndata: [DONE]\n\n', {
            headers: { "content-type": "text/event-stream" },
          })
        return Response.json({ object: "list", data: [] })
      },
    })

    ctx = await setupContext({
      BALLM_GATEWAY_INTERNAL_URL: `http://127.0.0.1:${upstream.port}`,
    })

    const response = await ctx.app.request("/v1/chat/completions?trace=1", {
      method: "POST",
      headers: {
        authorization: "Bearer access-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "ballm-fast", messages: [] }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(await response.text()).toContain("data: [DONE]")
    expect(captured?.path).toBe("/v1/chat/completions")
    expect(captured?.authorization).toBe("Bearer access-token")
    expect(captured?.body).toBe('{"model":"ballm-fast","messages":[]}')
  })

  test("returns 503 when no internal gateway is configured", async () => {
    ctx = await setupContext()
    const response = await ctx.app.request("/v1/models", {
      headers: { authorization: "Bearer access-token" },
    })
    expect(response.status).toBe(503)
    expect(((await response.json()) as { error: { type: string } }).error.type).toBe("server_error")
  })
})

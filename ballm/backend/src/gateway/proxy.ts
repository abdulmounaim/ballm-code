import { Hono } from "hono"
import type { Context } from "hono"
import { authenticate } from "../auth/token.js"
import type { ServerConfig } from "../env.js"
import type { DB } from "../store/db.js"
import { audit } from "../store/repository.js"

export function gatewayRoutes(db: DB, config: ServerConfig) {
  const app = new Hono()

  app.get("/v1/models", (c) => {
    const session = authenticate(c, db)
    if (!session) return unauthorized(c)
    return c.json({
      object: "list",
      data: config.models.map((model) => ({
        id: model.id,
        object: "model",
        created: 0,
        owned_by: "ballm",
      })),
    })
  })

  app.all("/v1/*", async (c) => {
    const session = authenticate(c, db)
    if (!session) return unauthorized(c)

    const url = new URL(c.req.url)
    const path = url.pathname
    const request = await readRequest(c.req.raw)
    if (request.model && !config.models.some((model) => model.id === request.model)) {
      return c.json(errorEnvelope("invalid_request_error", `Model ${request.model} is not available`), 403)
    }

    audit(db, {
      kind: "gateway.request",
      userId: session.user_id,
      orgId: session.org_id,
      detail: `${c.req.method} ${path}${request.model ? ` model=${request.model}` : ""}`,
    })

    if (config.devEcho) return echo(c, config, request)

    if (!config.upstreamBaseUrl) {
      return c.json(errorEnvelope("server_error", "UPSTREAM_BASE_URL is not configured"), 503)
    }

    const headers = new Headers(c.req.raw.headers)
    for (const name of [
      "authorization",
      "x-api-key",
      "host",
      "content-length",
      "content-encoding",
      "transfer-encoding",
    ]) {
      headers.delete(name)
    }
    if (config.upstreamApiKey) headers.set("authorization", `Bearer ${config.upstreamApiKey}`)

    const hasBody = c.req.method !== "GET" && c.req.method !== "HEAD"
    const target = `${config.upstreamBaseUrl}${path.slice("/v1".length)}${url.search}`
    const response = await fetch(target, {
      method: c.req.method,
      headers,
      body: hasBody ? c.req.raw.body : undefined,
      redirect: "manual",
    })

    const responseHeaders = new Headers(response.headers)
    for (const name of ["content-encoding", "content-length", "transfer-encoding"]) responseHeaders.delete(name)
    return new Response(response.body, { status: response.status, headers: responseHeaders })
  })

  return app
}

function unauthorized(c: Context) {
  return c.json(errorEnvelope("authentication_error", "Invalid or expired token"), 401)
}

function errorEnvelope(type: string, message: string) {
  return { error: { type, message } }
}

/** Reads the requested model and stream flag without consuming the body that is proxied upstream. */
async function readRequest(request: Request) {
  if (request.method !== "POST") return { model: undefined, stream: false }
  const type = request.headers.get("content-type")
  if (!type?.includes("application/json")) return { model: undefined, stream: false }
  const body = (await request
    .clone()
    .json()
    .catch(() => undefined)) as { model?: unknown; stream?: unknown } | undefined
  return {
    model: typeof body?.model === "string" ? body.model : undefined,
    stream: body?.stream === true,
  }
}

function echo(c: Context, config: ServerConfig, request: { model: string | undefined; stream: boolean }) {
  const selected = request.model ?? config.models[0]?.id ?? "ballm-fast"
  const id = `chatcmpl_${crypto.randomUUID()}`
  const created = Math.floor(Date.now() / 1000)
  const content = `Ballm dev echo from ${selected}.`

  if (request.stream) {
    const encoder = new TextEncoder()
    const chunk = (delta: Record<string, unknown>, finish: string | null) =>
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model: selected,
        choices: [{ index: 0, delta, finish_reason: finish }],
      })}\n\n`
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(chunk({ role: "assistant", content: "" }, null)))
        controller.enqueue(encoder.encode(chunk({ content }, null)))
        controller.enqueue(encoder.encode(chunk({}, "stop")))
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      },
    })
    return new Response(body, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    })
  }

  return c.json({
    id,
    object: "chat.completion",
    created,
    model: selected,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  })
}

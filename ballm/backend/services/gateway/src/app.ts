import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { ping } from "@ballm/platform/db"
import { ApiError, apiError, retryAfter } from "@ballm/platform/http"
import { accessAuth } from "./auth"
import type { GatewayDeps } from "./deps"
import { take } from "./limit"

export function createApp(deps: GatewayDeps) {
  const app = new Hono<{ Variables: import("./deps").Variables }>()

  app.use("*", async (c, next) => {
    const id = c.req.header("x-request-id") ?? randomUUID()
    c.set("requestId", id)
    c.set("logger", deps.logger.child({ requestId: id }))
    c.header("x-request-id", id)
    c.header("x-content-type-options", "nosniff")
    const started = performance.now()
    await next()
    const durationSeconds = (performance.now() - started) / 1000
    deps.metrics.observeHttp({
      method: c.req.method,
      route: c.req.routePath || c.req.path,
      status: c.res.status,
      durationSeconds,
    })
    c.get("logger").info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(durationSeconds * 1000),
    })
  })

  app.onError((error, c) => {
    const mapped = apiError(error)
    if (mapped.status >= 500)
      deps.logger.error("gateway error", {
        path: c.req.path,
        error: error instanceof Error ? error.message : String(error),
      })
    return c.json(mapped.body, mapped.status as 400)
  })

  app.notFound((c) => c.json({ error: { type: "not_found", message: "Route not found" } }, 404))

  app.get("/health", (c) => c.json({ ok: true, service: "gateway", region: deps.env.BALLM_REGION }))

  app.get("/ready", async (c) => {
    const [database, cache] = await Promise.allSettled([ping(deps.db.read), deps.cache.ping()])
    const ready = database.status === "fulfilled" && cache.status === "fulfilled"
    return c.json(
      { ok: ready, database: database.status, cache: cache.status, cache_kind: deps.cache.kind },
      ready ? 200 : 503,
    )
  })

  app.get("/metrics", async (c) => {
    c.header("content-type", deps.metrics.contentType)
    return c.body(await deps.metrics.render())
  })

  app.use("/v1/*", accessAuth(deps))

  app.get("/v1/models", async (c) => {
    const claims = c.get("claims")
    const catalog = await deps.catalog.get(claims.org)
    return c.json({
      object: "list",
      data: (catalog?.models ?? []).map((model) => ({
        id: model.id,
        object: "model",
        created: 0,
        owned_by: "ballm",
      })),
    })
  })

  app.all("/v1/*", async (c) => {
    const claims = c.get("claims")
    const requestId = c.get("requestId")
    const catalog = await deps.catalog.get(claims.org)
    if (!catalog || catalog.models.length === 0)
      return c.json({ error: { type: "permission_error", message: "No models are enabled for this organization" } }, 403)

    const limited = await take(
      deps.cache,
      `ballm:gw:rl:${claims.org}:${claims.sub}`,
      deps.env.BALLM_GATEWAY_RATE_LIMIT_PER_MINUTE,
    )
    c.header("x-ratelimit-limit", String(limited.limit))
    c.header("x-ratelimit-remaining", String(limited.remaining))
    if (!limited.allowed) {
      deps.metrics.rateLimited("gateway")
      return c.json(
        { error: { type: "rate_limit_error", message: "Too many requests; retry later" } },
        429,
        retryAfter(limited.retryAfter),
      )
    }

    const request = await readRequest(c.req.raw)
    if (request.model) {
      const model = catalog.models.find((item) => item.id === request.model)
      if (!model)
        return c.json(
          { error: { type: "invalid_request_error", message: `Model ${request.model} is not available` } },
          403,
        )
      request.upstreamModel = model.upstreamModel
      if (request.json) {
        request.json.model = model.upstreamModel
        request.body = JSON.stringify(request.json)
      }
    }

    const baseUrl = catalog.upstreamBaseUrl ?? deps.env.BALLM_UPSTREAM_BASE_URL
    if (!baseUrl)
      return c.json({ error: { type: "server_error", message: "No upstream is configured for this organization" } }, 503)
    const apiKey = catalog.upstreamApiKey ?? deps.env.BALLM_UPSTREAM_API_KEY

    const started = performance.now()
    deps.metrics.activeRequests(1)
    try {
      const url = new URL(c.req.url)
      const target = `${baseUrl.replace(/\/+$/, "")}${url.pathname.slice("/v1".length)}${url.search}`
      const headers = new Headers(c.req.raw.headers)
      for (const name of [
        "authorization",
        "x-api-key",
        "host",
        "content-length",
        "content-encoding",
        "transfer-encoding",
        "cookie",
      ])
        headers.delete(name)
      if (apiKey) headers.set("authorization", `Bearer ${apiKey}`)
      headers.set("x-request-id", requestId)

      const response = await fetch(target, {
        method: c.req.method,
        headers,
        body: request.body,
        redirect: "manual",
        signal: AbortSignal.timeout(deps.env.BALLM_GATEWAY_TIMEOUT_MS),
      })

      const durationSeconds = (performance.now() - started) / 1000
      deps.metrics.observeUpstream({
        model: request.upstreamModel ?? request.model ?? "unknown",
        status: response.status,
        durationSeconds,
      })

      const responseHeaders = new Headers(response.headers)
      for (const name of ["content-encoding", "content-length", "transfer-encoding"]) responseHeaders.delete(name)
      const contentType = response.headers.get("content-type") ?? ""
      const usage = { prompt: undefined as number | undefined, completion: undefined as number | undefined, total: undefined as number | undefined }

      const record = () =>
        deps.usage.record({
          orgId: claims.org,
          userId: claims.sub,
          sessionId: claims.sid,
          modelId: request.model ?? request.upstreamModel ?? "unknown",
          upstreamModel: request.upstreamModel,
          promptTokens: usage.prompt,
          completionTokens: usage.completion,
          totalTokens: usage.total,
          latencyMs: Math.round((performance.now() - started)),
          status: response.status,
          requestId,
        })

      if (contentType.includes("text/event-stream") && response.body) {
        const [client, tap] = response.body.tee()
        void consumeSse(tap, (value) => {
          usage.prompt = value.prompt_tokens
          usage.completion = value.completion_tokens
          usage.total = value.total_tokens
        }).finally(record)
        return new Response(client, { status: response.status, headers: responseHeaders })
      }

      if (contentType.includes("application/json") && c.req.method !== "HEAD") {
        const text = await response.text()
        try {
          const value = JSON.parse(text) as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }
          usage.prompt = value.usage?.prompt_tokens
          usage.completion = value.usage?.completion_tokens
          usage.total = value.usage?.total_tokens
        } catch {
          // Forward non-JSON bodies untouched.
        }
        record()
        return new Response(text, { status: response.status, headers: responseHeaders })
      }

      record()
      return new Response(response.body, { status: response.status, headers: responseHeaders })
    } catch (error) {
      const durationSeconds = (performance.now() - started) / 1000
      deps.metrics.observeUpstream({
        model: request.upstreamModel ?? request.model ?? "unknown",
        status: 502,
        durationSeconds,
      })
      deps.usage.record({
        orgId: claims.org,
        userId: claims.sub,
        sessionId: claims.sid,
        modelId: request.model ?? request.upstreamModel ?? "unknown",
        upstreamModel: request.upstreamModel,
        latencyMs: Math.round((performance.now() - started)),
        status: 502,
        requestId,
      })
      const timeout = error instanceof Error && error.name === "TimeoutError"
      throw new ApiError(timeout ? 504 : 502, timeout ? "timeout" : "upstream_error", "Upstream request failed")
    } finally {
      deps.metrics.activeRequests(-1)
    }
  })

  return app
}

interface ProxyRequest {
  body: RequestInit["body"] | undefined
  model?: string
  upstreamModel?: string
  json?: Record<string, unknown>
}

async function readRequest(request: Request): Promise<ProxyRequest> {
  if (request.method === "GET" || request.method === "HEAD") return { body: undefined }
  const type = request.headers.get("content-type") ?? ""
  if (!type.includes("application/json")) return { body: request.body ?? undefined }

  const text = await request.text()
  try {
    const value = JSON.parse(text) as Record<string, unknown>
    const model = typeof value.model === "string" ? value.model : undefined
    return { body: text, model, json: value }
  } catch {
    return { body: text }
  }
}

async function consumeSse(
  stream: ReadableStream<Uint8Array>,
  onUsage: (usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) => void,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split("\n\n")
      buffer = events.pop() ?? ""
      if (buffer.length > 1_000_000) buffer = buffer.slice(-10_000)
      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6)
          if (data === "[DONE]") continue
          try {
            const parsed = JSON.parse(data) as {
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
            }
            if (parsed.usage) onUsage(parsed.usage)
          } catch {
            // Ignore malformed events; the client still receives the original stream.
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

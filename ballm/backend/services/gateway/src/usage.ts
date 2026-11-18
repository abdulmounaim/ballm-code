import type { Sql } from "@ballm/platform/db"
import type { Logger } from "@ballm/platform/logging"
import type { Metrics } from "@ballm/platform/metrics"

export interface UsageEvent {
  orgId: string
  userId: string
  sessionId: string
  modelId: string
  upstreamModel?: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  latencyMs: number
  status: number
  requestId: string
}

/**
 * Batches usage rows off the request path. Losing a batch on a database outage is preferable to
 * slowing or failing inference; the gateway log still carries the request metadata.
 */
export class UsageRecorder {
  private queue: UsageEvent[] = []
  private timer: ReturnType<typeof setInterval> | undefined
  private flushing = false

  constructor(
    private readonly input: {
      sql: Sql
      logger: Logger
      metrics: Metrics
      maxBatch?: number
      intervalMs?: number
    },
  ) {
    this.timer = setInterval(() => void this.flush(), input.intervalMs ?? 1_000)
  }

  record(event: UsageEvent) {
    this.queue.push(event)
    if (event.promptTokens) this.input.metrics.addTokens({ org: event.orgId, model: event.modelId, kind: "prompt" })
    if (event.completionTokens)
      this.input.metrics.addTokens({ org: event.orgId, model: event.modelId, kind: "completion" })
    if (this.queue.length >= (this.input.maxBatch ?? 200)) void this.flush()
  }

  async flush() {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true
    const rows = this.queue.splice(0, this.input.maxBatch ?? 200)
    try {
      const values = rows.map((row) => ({
        org_id: row.orgId,
        user_id: row.userId,
        session_id: row.sessionId,
        model_id: row.modelId,
        upstream_model: row.upstreamModel ?? null,
        prompt_tokens: row.promptTokens ?? null,
        completion_tokens: row.completionTokens ?? null,
        total_tokens: row.totalTokens ?? null,
        latency_ms: row.latencyMs,
        status: row.status,
        request_id: row.requestId,
      }))
      await this.input.sql`
        INSERT INTO usage_events ${this.input.sql(values, "org_id", "user_id", "session_id", "model_id", "upstream_model", "prompt_tokens", "completion_tokens", "total_tokens", "latency_ms", "status", "request_id")}
      `
    } catch (error) {
      this.input.logger.error("usage batch failed", {
        rows: rows.length,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.flushing = false
    }
  }

  async close() {
    if (this.timer) clearInterval(this.timer)
    await this.flush()
  }
}

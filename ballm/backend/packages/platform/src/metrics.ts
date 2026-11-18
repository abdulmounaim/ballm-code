import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client"

export interface Metrics {
  readonly contentType: string
  observeHttp(input: {
    method: string
    route: string
    status: number
    durationSeconds: number
  }): void
  observeUpstream(input: { model: string; status: number; durationSeconds: number }): void
  addTokens(input: { org: string; model: string; kind: "prompt" | "completion" }): void
  activeRequests(delta: number): void
  rateLimited(scope: string): void
  render(): Promise<string>
}

export function createMetrics(input: { service: string; region: string }): Metrics {
  const registry = new Registry()
  registry.setDefaultLabels({ service: input.service, region: input.region })
  collectDefaultMetrics({ register: registry, prefix: "ballm_" })

  const httpRequests = new Counter({
    name: "ballm_http_requests_total",
    help: "HTTP requests",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  })
  const httpDuration = new Histogram({
    name: "ballm_http_request_duration_seconds",
    help: "HTTP request duration",
    labelNames: ["method", "route", "status"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
    registers: [registry],
  })
  const upstreamRequests = new Counter({
    name: "ballm_upstream_requests_total",
    help: "Upstream model requests",
    labelNames: ["model", "status"],
    registers: [registry],
  })
  const upstreamDuration = new Histogram({
    name: "ballm_upstream_request_duration_seconds",
    help: "Upstream model request duration",
    labelNames: ["model", "status"],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600],
    registers: [registry],
  })
  const tokens = new Counter({
    name: "ballm_gateway_tokens_total",
    help: "Tokens observed at the gateway",
    labelNames: ["org", "model", "kind"],
    registers: [registry],
  })
  const active = new Gauge({
    name: "ballm_gateway_active_requests",
    help: "In-flight upstream requests",
    registers: [registry],
  })
  const limited = new Counter({
    name: "ballm_rate_limited_total",
    help: "Requests rejected by a rate limiter",
    labelNames: ["scope"],
    registers: [registry],
  })

  return {
    contentType: registry.contentType,
    observeHttp(request) {
      const labels = { method: request.method, route: request.route, status: String(request.status) }
      httpRequests.inc(labels)
      httpDuration.observe(labels, request.durationSeconds)
    },
    observeUpstream(request) {
      const labels = { model: request.model, status: String(request.status) }
      upstreamRequests.inc(labels)
      upstreamDuration.observe(labels, request.durationSeconds)
    },
    addTokens(request) {
      tokens.inc({ org: request.org, model: request.model, kind: request.kind })
    },
    activeRequests(delta) {
      active.inc(delta)
    },
    rateLimited(scope) {
      limited.inc({ scope })
    },
    render() {
      return registry.metrics()
    },
  }
}

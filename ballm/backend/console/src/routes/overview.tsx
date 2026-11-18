import { A, useNavigate } from "@solidjs/router"
import { For, Show, createResource, createSignal } from "solid-js"
import { Badge } from "../components/badge"
import { Card, CardBody, CardHeader } from "../components/card"
import { Button } from "../components/button"
import { Icon } from "../components/icon"
import { AreaChart, BreakdownBars, Stat } from "../components/stat"
import { InlineError, PageHeader, Skeleton } from "../components/ui"
import { Segmented } from "../components/controls"
import { actorLabel, auditLabel, compactNumber, errorRate, fullNumber, timeAgo } from "../lib/format"
import { useSession } from "../session"
import type { Overview } from "../types"

export function OverviewPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [metric, setMetric] = createSignal<"requests" | "tokens">("requests")
  const [data, { refetch }] = createResource<Overview, string | undefined>(
    () => session.orgId(),
    () => session.request<Overview>("/api/console/overview"),
  )

  return (
    <div class="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Organization overview"
        description={`Access, model usage, and configuration health for ${session.org()?.name ?? "this organization"}.`}
        actions={
          <>
            <Button onClick={() => navigate("/usage")}>
              <Icon name="chart" class="size-4" /> Usage
            </Button>
            <Button variant="primary" onClick={() => navigate("/members")}>
              <Icon name="plus" class="size-4" /> Add member
            </Button>
          </>
        }
      />

      <Show
        when={!data.error}
        fallback={
          <InlineError
            title="Could not load the overview"
            description={data.error instanceof Error ? data.error.message : undefined}
            onRetry={() => void refetch()}
          />
        }
      >
        <Show when={data()} fallback={<OverviewSkeleton />}>
          {(overview) => (
            <>
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Stat
                  label="Members"
                  value={fullNumber(overview().summary.members)}
                  hint={`${overview().readiness.owners} owner${overview().readiness.owners === 1 ? "" : "s"}`}
                  icon="users"
                />
                <Stat
                  label="Active sessions"
                  value={fullNumber(overview().summary.activeSessions)}
                  hint="Seen in the last 7 days"
                  icon="monitor"
                />
                <Stat
                  label="Requests"
                  value={compactNumber(overview().summary.requests30d)}
                  hint="Last 30 days"
                  icon="activity"
                  tone="accent"
                />
                <Stat
                  label="Tokens"
                  value={compactNumber(overview().summary.tokens30d)}
                  hint="Prompt, completion, and cached"
                  icon="chart"
                />
                <Stat
                  label="Error rate"
                  value={errorRate(overview().summary.errors30d, overview().summary.requests30d)}
                  hint={`${fullNumber(overview().summary.errors30d)} failed requests`}
                  icon="alert"
                  tone={overview().summary.errors30d > 0 ? "danger" : "default"}
                />
              </div>

              <div class="grid gap-4 xl:grid-cols-3">
                <Card class="xl:col-span-2">
                  <CardHeader
                    title="Request volume"
                    description="Model traffic through the Ballm gateway over the last 14 days."
                    actions={
                      <Segmented
                        label="Metric"
                        value={metric()}
                        onChange={setMetric}
                        options={[
                          { value: "requests", label: "Requests" },
                          { value: "tokens", label: "Tokens" },
                        ]}
                      />
                    }
                  />
                  <CardBody>
                    <Show
                      when={overview().usage.byDay.length > 0}
                      fallback={
                        <div class="grid h-44 place-items-center">
                          <div class="text-center">
                            <p class="text-[13px] font-medium text-ink">No gateway traffic yet</p>
                            <p class="mt-1 text-[12px] text-ink-muted">
                              Usage appears after the first request reaches the gateway.
                            </p>
                          </div>
                        </div>
                      }
                    >
                      <AreaChart points={overview().usage.byDay} metric={metric()} />
                    </Show>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="Top models"
                    description="Requests over 30 days"
                    actions={<Badge tone="neutral">{overview().summary.models} enabled</Badge>}
                  />
                  <CardBody>
                    <BreakdownBars items={overview().usage.byModel} empty="No model usage recorded" />
                  </CardBody>
                </Card>
              </div>

              <div class="grid gap-4 xl:grid-cols-3">
                <Card class="xl:col-span-2">
                  <CardHeader
                    title="Recent activity"
                    description="Administrative and authentication events"
                    actions={
                      <A
                        href="/audit"
                        class="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
                      >
                        View all <Icon name="chevron-right" class="size-3" />
                      </A>
                    }
                  />
                  <CardBody class="px-0 py-0">
                    <Show
                      when={overview().recent.length > 0}
                      fallback={
                        <p class="px-5 py-8 text-center text-[12.5px] text-ink-subtle">No activity recorded yet.</p>
                      }
                    >
                      <ul class="divide-y divide-line">
                        <For each={overview().recent}>
                          {(event) => (
                            <li class="flex items-start gap-3 px-5 py-3">
                              <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-canvas-elevated text-ink-muted">
                                <Icon name={eventIcon(event.kind)} class="size-3.5" />
                              </span>
                              <div class="min-w-0 flex-1">
                                <p class="text-[12.5px] text-ink">{auditLabel(event.kind)}</p>
                                <p class="truncate text-[11.5px] text-ink-subtle">
                                  {actorLabel(event.email, event.kind)} · {event.kind}
                                </p>
                              </div>
                              <time class="shrink-0 text-[11px] text-ink-subtle" datetime={event.at}>
                                {timeAgo(event.at)}
                              </time>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Readiness" description="Configuration checks" />
                  <CardBody class="space-y-1">
                    <Checklist
                      ok={overview().readiness.sso}
                      title="Single sign-on"
                      detail={overview().readiness.sso ? "Identity provider connected" : "Configure an OIDC connection"}
                      href="/identity"
                    />
                    <Checklist
                      ok={overview().readiness.upstream}
                      title="Model upstream"
                      detail={overview().readiness.upstream ? "Base URL configured" : "Add an upstream base URL"}
                      href="/upstream"
                    />
                    <Checklist
                      ok={overview().readiness.hasUpstreamKey}
                      title="Upstream credential"
                      detail={overview().readiness.hasUpstreamKey ? "Encrypted key stored" : "No API key stored"}
                      href="/upstream"
                    />
                    <Checklist
                      ok={overview().summary.models > 0}
                      title="Model allowlist"
                      detail={
                        overview().summary.models > 0
                          ? `${overview().summary.models} models enabled`
                          : "No models enabled"
                      }
                      href="/models"
                    />
                    <Checklist
                      ok={overview().readiness.owners > 0}
                      title="Organization owners"
                      detail={`${overview().readiness.owners} owner${overview().readiness.owners === 1 ? "" : "s"}`}
                      href="/members"
                    />
                  </CardBody>
                </Card>
              </div>
            </>
          )}
        </Show>
      </Show>
    </div>
  )
}

function Checklist(props: { ok: boolean; title: string; detail: string; href: string }) {
  return (
    <A
      href={props.href}
      class="flex items-start gap-3 rounded-lg px-2 py-2 transition hover:bg-surface-hover"
    >
      <span
        class={
          props.ok
            ? "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success"
            : "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-warning-soft text-warning"
        }
      >
        <Icon name={props.ok ? "check" : "alert"} class="size-3" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-[12.5px] text-ink">{props.title}</span>
        <span class="block text-[11.5px] text-ink-subtle">{props.detail}</span>
      </span>
      <Icon name="chevron-right" class="mt-1 size-3.5 shrink-0 text-ink-subtle" />
    </A>
  )
}

function eventIcon(kind: string) {
  if (kind.includes("member")) return "users" as const
  if (kind.includes("model")) return "chip" as const
  if (kind.includes("policy")) return "list" as const
  if (kind.includes("sso") || kind.startsWith("auth.")) return "shield" as const
  if (kind.includes("upstream")) return "plug" as const
  if (kind.startsWith("device") || kind.includes("session")) return "monitor" as const
  return "activity" as const
}

function OverviewSkeleton() {
  return (
    <div class="space-y-4" aria-hidden="true">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <For each={[0, 1, 2, 3, 4]}>{() => <Skeleton class="h-[104px]" />}</For>
      </div>
      <div class="grid gap-4 xl:grid-cols-3">
        <Skeleton class="h-[300px] xl:col-span-2" />
        <Skeleton class="h-[300px]" />
      </div>
    </div>
  )
}

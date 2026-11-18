import { Show, createResource, createSignal } from "solid-js"
import { Badge } from "../components/badge"
import { Card, CardBody, CardHeader } from "../components/card"
import { Icon } from "../components/icon"
import { AreaChart, BreakdownBars, Stat } from "../components/stat"
import { InlineError, PageHeader, Skeleton } from "../components/ui"
import { Segmented } from "../components/controls"
import { compactNumber, fullNumber } from "../lib/format"
import { useSession } from "../session"
import type { UsageBreakdown, UsagePoint } from "../types"

interface UsageResponse {
  days: number
  byDay: UsagePoint[]
  byModel: UsageBreakdown[]
  byUser: UsageBreakdown[]
}

export function UsagePage() {
  const session = useSession()
  const [days, setDays] = createSignal(30)
  const [metric, setMetric] = createSignal<"requests" | "tokens">("requests")

  const [data, { refetch }] = createResource<UsageResponse, { orgId: string | undefined; days: number }>(
    () => ({ orgId: session.orgId(), days: days() }),
    (source) => session.request<UsageResponse>(`/api/console/usage?days=${source.days}`),
  )

  const totalRequests = () => (data()?.byDay ?? []).reduce((sum, point) => sum + point.requests, 0)
  const totalTokens = () => (data()?.byDay ?? []).reduce((sum, point) => sum + point.tokens, 0)
  const peak = () => Math.max(0, ...(data()?.byDay ?? []).map((point) => point.requests))

  return (
    <div class="space-y-5">
      <PageHeader
        eyebrow="Observability"
        title="Usage"
        description="Model traffic recorded by the gateway. Usage rows are partitioned by month in Postgres."
        actions={
          <Segmented
            label="Range"
            value={String(days())}
            onChange={(value) => setDays(Number(value))}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        }
      />

      <Show
        when={!data.error}
        fallback={
          <InlineError
            title="Could not load usage"
            description={data.error instanceof Error ? data.error.message : undefined}
            onRetry={() => void refetch()}
          />
        }
      >
        <Show when={data()} fallback={<UsageSkeleton />}>
          {(usage) => (
            <>
              <div class="grid gap-3 sm:grid-cols-3">
                <Stat
                  label="Requests"
                  value={compactNumber(totalRequests())}
                  hint={`Last ${days()} days`}
                  icon="activity"
                  tone="accent"
                />
                <Stat
                  label="Tokens"
                  value={compactNumber(totalTokens())}
                  hint={`${fullNumber(totalTokens())} total`}
                  icon="chart"
                />
                <Stat
                  label="Peak day"
                  value={fullNumber(peak())}
                  hint="Requests in a single day"
                  icon="chart"
                />
              </div>

              <div class="grid gap-4 xl:grid-cols-3">
                <Card class="xl:col-span-2">
                  <CardHeader
                    title="Daily volume"
                    description={`${days()} days of gateway traffic`}
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
                      when={usage().byDay.length > 0}
                      fallback={
                        <div class="grid h-44 place-items-center text-center">
                          <div>
                            <p class="text-[13px] font-medium text-ink">No usage in this range</p>
                            <p class="mt-1 text-[12px] text-ink-muted">Try a wider range or send a gateway request.</p>
                          </div>
                        </div>
                      }
                    >
                      <AreaChart points={usage().byDay} metric={metric()} />
                    </Show>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="By model" description="Requests in range" />
                  <CardBody>
                    <BreakdownBars items={usage().byModel} empty="No model traffic" />
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader
                  title="By developer"
                  description="Top requesters in range"
                  actions={<Badge tone="neutral">Last {days()} days</Badge>}
                />
                <CardBody>
                  <Show
                    when={usage().byUser.length > 0}
                    fallback={<p class="py-6 text-center text-[12.5px] text-ink-subtle">No developer traffic yet.</p>}
                  >
                    <div class="overflow-x-auto">
                      <table class="w-full text-left">
                        <caption class="sr-only">Usage by developer</caption>
                        <thead>
                          <tr class="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                            <th scope="col" class="py-2 pr-4 font-medium">Developer</th>
                            <th scope="col" class="px-4 py-2 font-medium">Requests</th>
                            <th scope="col" class="px-4 py-2 font-medium">Share</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-line">
                          {usage().byUser.map((row) => (
                            <tr>
                              <td class="py-2.5 pr-4 text-[12.5px] text-ink">{row.label}</td>
                              <td class="px-4 py-2.5 text-[12px] text-ink-muted tabular">{fullNumber(row.requests)}</td>
                              <td class="px-4 py-2.5">
                                <div class="flex items-center gap-2">
                                  <div class="h-1.5 w-32 overflow-hidden rounded-full bg-surface-strong">
                                    <div
                                      class="h-full rounded-full bg-accent/80"
                                      style={{ width: `${Math.max(2, (row.requests / Math.max(1, totalRequests())) * 100)}%` }}
                                    />
                                  </div>
                                  <span class="text-[11px] text-ink-subtle tabular">
                                    {Math.round((row.requests / Math.max(1, totalRequests())) * 100)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Show>
                </CardBody>
              </Card>
            </>
          )}
        </Show>
      </Show>

      <p class="flex items-start gap-2 text-[11.5px] leading-5 text-ink-subtle">
        <Icon name="info" class="mt-0.5 size-3.5 shrink-0" />
        Token counts come from the upstream <code class="font-mono">usage</code> field, including the
        final streaming chunk. A request without usage metadata is counted but has no token total.
      </p>
    </div>
  )
}

function UsageSkeleton() {
  return (
    <div class="space-y-4" aria-hidden="true">
      <div class="grid gap-3 sm:grid-cols-3">
        <Skeleton class="h-[104px]" />
        <Skeleton class="h-[104px]" />
        <Skeleton class="h-[104px]" />
      </div>
      <Skeleton class="h-80" />
    </div>
  )
}

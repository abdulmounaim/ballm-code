import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js"
import { Badge } from "../components/badge"
import { Button } from "../components/button"
import { Card } from "../components/card"
import { Icon } from "../components/icon"
import { Select } from "../components/field"
import { Empty, InlineError, PageHeader, Skeleton } from "../components/ui"
import { actorLabel, auditLabel, fullDate, timeAgo, titleCase } from "../lib/format"
import { useSession } from "../session"
import type { AuditEvent } from "../types"

interface AuditResponse {
  events: AuditEvent[]
  kinds: Array<{ kind: string; count: number }>
}

export function AuditPage() {
  const session = useSession()
  const [kind, setKind] = createSignal("")
  const [events, setEvents] = createSignal<AuditEvent[]>([])
  const [kinds, setKinds] = createSignal<Array<{ kind: string; count: number }>>([])
  const [loading, setLoading] = createSignal(true)
  const [loadingMore, setLoadingMore] = createSignal(false)
  const [error, setError] = createSignal<string>()
  let generation = 0

  const load = async (reset: boolean) => {
    const current = ++generation
    if (reset) {
      setLoading(true)
      setError(undefined)
    } else {
      setLoadingMore(true)
    }
    try {
      const cursor = reset ? undefined : events().at(-1)
      const query = new URLSearchParams({ limit: "50" })
      if (kind()) query.set("kind", kind())
      if (cursor) {
        query.set("before", cursor.at)
        query.set("beforeId", cursor.id)
      }
      const response = await session.request<AuditResponse>(`/api/console/audit?${query.toString()}`)
      if (current !== generation) return
      setKinds(response.kinds)
      setEvents((existing) => (reset ? response.events : [...existing, ...response.events]))
    } catch (cause) {
      if (current === generation) setError(cause instanceof Error ? cause.message : "Could not load the audit log")
    } finally {
      if (current === generation) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }

  createEffect(on([() => session.orgId(), kind], () => void load(true), { defer: false }))

  onCleanup(() => {
    generation += 1
  })

  return (
    <div class="space-y-5">
      <PageHeader
        eyebrow="Observability"
        title="Audit log"
        description="Authentication, configuration, and administrative changes for this organization. Rows are append-only and partitioned by month."
        actions={
          <Select
            class="h-9 w-56"
            value={kind()}
            aria-label="Filter by event kind"
            onChange={(event) => setKind(event.currentTarget.value)}
            options={[
              { value: "", label: "All events" },
              ...kinds().map((item) => ({ value: item.kind, label: `${titleCase(item.kind)} (${item.count})` })),
            ]}
          />
        }
      />

      <Show
        when={!error()}
        fallback={<InlineError title="Could not load the audit log" description={error()} onRetry={() => void load(true)} />}
      >
        <Card>
          <Show when={!loading()} fallback={<AuditSkeleton />}>
            <Show
              when={events().length > 0}
              fallback={
                <Empty
                  icon={<Icon name="activity" class="size-5" />}
                  title={kind() ? "No events of this kind" : "No audit events yet"}
                  description={
                    kind()
                      ? "Clear the filter to see every event."
                      : "Sign-ins, configuration changes, and session revocations appear here."
                  }
                />
              }
            >
              <ol class="divide-y divide-line">
                <For each={events()}>
                  {(event) => (
                    <li class="px-5 py-3.5">
                      <div class="flex items-start gap-3">
                        <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-canvas-elevated text-ink-muted">
                          <Icon name={iconFor(event.kind)} class="size-3.5" />
                        </span>
                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p class="text-[12.5px] font-medium text-ink">{auditLabel(event.kind)}</p>
                            <code class="rounded bg-surface-strong px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle">
                              {event.kind}
                            </code>
                          </div>
                          <p class="mt-0.5 text-[11.5px] text-ink-muted">
                            {actorLabel(event.email, event.kind)}
                            <span class="mx-1 text-ink-subtle">·</span>
                            <time datetime={event.at} title={fullDate(event.at)}>
                              {timeAgo(event.at)}
                            </time>
                          </p>
                          <Show when={event.detail !== null && event.detail !== undefined}>
                            <details class="group mt-1.5">
                              <summary class="cursor-pointer list-none text-[11px] font-medium text-ink-subtle transition hover:text-ink">
                                <span class="group-open:hidden">Show detail</span>
                                <span class="hidden group-open:inline">Hide detail</span>
                              </summary>
                              <pre class="mt-1.5 max-h-48 overflow-auto rounded-lg border border-line bg-canvas-elevated p-2.5 font-mono text-[10.5px] leading-5 text-ink-muted">
                                {JSON.stringify(event.detail, null, 2)}
                              </pre>
                            </details>
                          </Show>
                        </div>
                        <div class="hidden shrink-0 text-right sm:block">
                          <Badge tone="neutral">{titleCase(event.kind.split(".")[0] ?? "")}</Badge>
                        </div>
                      </div>
                    </li>
                  )}
                </For>
              </ol>

              <div class="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
                <p class="text-[11.5px] text-ink-subtle">
                  Showing {events().length} events{kind() ? ` for ${kind()}` : ""}.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={loadingMore()}
                  disabled={events().length < 50}
                  onClick={() => void load(false)}
                >
                  Load more
                </Button>
              </div>
            </Show>
          </Show>
        </Card>
      </Show>
    </div>
  )
}

function iconFor(kind: string) {
  if (kind.startsWith("console.member")) return "users" as const
  if (kind.startsWith("console.model")) return "chip" as const
  if (kind.startsWith("console.policy")) return "list" as const
  if (kind.startsWith("console.sso") || kind.startsWith("auth.")) return "shield" as const
  if (kind.startsWith("console.upstream")) return "plug" as const
  if (kind.startsWith("device") || kind.startsWith("console.session")) return "monitor" as const
  return "activity" as const
}

function AuditSkeleton() {
  return (
    <div class="divide-y divide-line" aria-hidden="true">
      <For each={[0, 1, 2, 3, 4, 5]}>
        {() => (
          <div class="flex items-start gap-3 px-5 py-4">
            <Skeleton class="size-7 rounded-full" />
            <div class="flex-1 space-y-2">
              <Skeleton class="h-3 w-44" />
              <Skeleton class="h-2.5 w-64" />
            </div>
            <Skeleton class="h-4 w-16" />
          </div>
        )}
      </For>
    </div>
  )
}

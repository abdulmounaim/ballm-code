import { For, Show, createMemo, createResource, createSignal } from "solid-js"
import { Badge, RoleBadge } from "../components/badge"
import { IconButton } from "../components/button"
import { Card } from "../components/card"
import { ConfirmDialog } from "../components/dialog"
import { TextInput } from "../components/field"
import { Icon } from "../components/icon"
import { Avatar, Empty, InlineError, PageHeader, Skeleton } from "../components/ui"
import { useToast } from "../components/toast"
import { describeError } from "../api"
import { fullDate, parseUserAgent, plural, timeAgo } from "../lib/format"
import { useSession } from "../session"
import type { SessionRow } from "../types"

interface SessionsResponse {
  sessions: SessionRow[]
}

export function SessionsPage() {
  const session = useSession()
  const toast = useToast()
  const [query, setQuery] = createSignal("")
  const [target, setTarget] = createSignal<SessionRow>()
  const [revoking, setRevoking] = createSignal(false)

  const [data, { refetch }] = createResource<SessionsResponse, string | undefined>(
    () => session.orgId(),
    () => session.request<SessionsResponse>("/api/console/sessions"),
  )

  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase()
    const sessions = data()?.sessions ?? []
    if (!needle) return sessions
    return sessions.filter((row) =>
      [row.email, row.name ?? "", row.ip ?? "", row.auth_method, row.user_agent ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    )
  })

  const canRevoke = (row: SessionRow) => {
    if (session.session()?.role === "owner") return true
    return row.role === "member"
  }

  const revoke = async () => {
    const row = target()
    if (!row) return
    setRevoking(true)
    try {
      await session.request(`/api/console/sessions/${row.id}`, { method: "DELETE" })
      toast.success("Session revoked", `${row.email} was signed out.`)
      setTarget(undefined)
      await refetch()
    } catch (cause) {
      toast.error("Could not revoke the session", describeError(cause))
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div class="space-y-5">
      <PageHeader
        eyebrow="Security"
        title="Sessions"
        description="Devices with an active Ballm Code session in this organization. Revoking a session blocks new inference immediately."
      />

      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-56 flex-1 sm:max-w-xs">
          <Icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <TextInput
            class="pl-9"
            placeholder="Search sessions"
            aria-label="Search sessions"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <Badge tone="neutral">{plural(data()?.sessions.length ?? 0, "active session")}</Badge>
      </div>

      <Show
        when={!data.error}
        fallback={
          <InlineError
            title="Could not load sessions"
            description={data.error instanceof Error ? data.error.message : undefined}
            onRetry={() => void refetch()}
          />
        }
      >
        <Card>
          <Show when={!data.loading} fallback={<SessionsSkeleton />}>
            <Show
              when={filtered().length > 0}
              fallback={
                <Empty
                  icon={<Icon name="monitor" class="size-5" />}
                  title={query() ? "No matching sessions" : "No active sessions"}
                  description={
                    query()
                      ? "Try a different email, address, or client."
                      : "Sessions appear here after a developer connects Ballm Code."
                  }
                />
              }
            >
              <div class="overflow-x-auto">
                <table class="w-full text-left">
                  <caption class="sr-only">Active sessions</caption>
                  <thead>
                    <tr class="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                      <th scope="col" class="px-4 py-2.5 font-medium">User</th>
                      <th scope="col" class="hidden px-4 py-2.5 font-medium lg:table-cell">Client</th>
                      <th scope="col" class="hidden px-4 py-2.5 font-medium md:table-cell">Address</th>
                      <th scope="col" class="px-4 py-2.5 font-medium">Last seen</th>
                      <th scope="col" class="w-12 px-2 py-2.5"><span class="sr-only">Revoke</span></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-line">
                    <For each={filtered()}>
                      {(row) => {
                        const client = () => parseUserAgent(row.user_agent)
                        return (
                          <tr class="transition-colors hover:bg-surface-hover/60">
                            <td class="px-4 py-3">
                              <div class="flex items-center gap-3">
                                <Avatar name={row.name} email={row.email} size="sm" />
                                <div class="min-w-0">
                                  <div class="flex items-center gap-1.5">
                                    <p class="truncate text-[12.5px] font-medium text-ink">
                                      {row.name ?? row.email.split("@")[0]}
                                    </p>
                                    <RoleBadge role={row.role} />
                                  </div>
                                  <p class="truncate text-[11px] text-ink-muted">{row.email}</p>
                                </div>
                              </div>
                            </td>
                            <td class="hidden px-4 py-3 lg:table-cell">
                              <div class="flex items-center gap-2">
                                <Badge tone={row.auth_method === "sso" ? "info" : "neutral"}>
                                  {row.auth_method === "sso" ? "SSO" : row.auth_method === "device" ? "Device" : "Dev"}
                                </Badge>
                                <span class="text-[11.5px] text-ink-muted">
                                  {client().browser} · {client().os}
                                </span>
                              </div>
                            </td>
                            <td class="hidden px-4 py-3 font-mono text-[11px] text-ink-muted md:table-cell">
                              {row.ip ?? "—"}
                            </td>
                            <td class="px-4 py-3">
                              <p class="text-[12px] text-ink" title={fullDate(row.last_seen_at)}>
                                {timeAgo(row.last_seen_at)}
                              </p>
                              <p class="text-[11px] text-ink-subtle">since {fullDate(row.created_at)}</p>
                            </td>
                            <td class="px-2 py-3 text-right">
                              <IconButton
                                label={`Revoke session for ${row.email}`}
                                variant="ghost"
                                disabled={!canRevoke(row)}
                                onClick={() => setTarget(row)}
                              >
                                <Icon name="logout" class="size-4" />
                              </IconButton>
                            </td>
                          </tr>
                        )
                      }}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Show>
        </Card>
      </Show>

      <p class="flex items-start gap-2 text-[11.5px] leading-5 text-ink-subtle">
        <Icon name="info" class="mt-0.5 size-3.5 shrink-0" />
        Revocation is written to Redis immediately. Regions that do not share Redis keep the access
        token valid until its five-minute lifetime expires.
      </p>

      <ConfirmDialog
        open={Boolean(target())}
        onOpenChange={(open) => (open ? undefined : setTarget(undefined))}
        title="Revoke session"
        description={`Sign ${target()?.email ?? "this device"} out and block further model requests? They can reconnect through SSO.`}
        confirmLabel="Revoke session"
        loading={revoking()}
        onConfirm={() => void revoke()}
      />
    </div>
  )
}

function SessionsSkeleton() {
  return (
    <div class="divide-y divide-line" aria-hidden="true">
      <For each={[0, 1, 2, 3]}>
        {() => (
          <div class="flex items-center gap-3 px-4 py-3">
            <Skeleton class="size-7 rounded-full" />
            <div class="flex-1 space-y-1.5">
              <Skeleton class="h-3 w-40" />
              <Skeleton class="h-2.5 w-56" />
            </div>
            <Skeleton class="h-3 w-20" />
          </div>
        )}
      </For>
    </div>
  )
}

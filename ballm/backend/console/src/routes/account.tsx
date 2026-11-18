import { For, Show, createResource, createSignal } from "solid-js"
import { Badge, RoleBadge } from "../components/badge"
import { Button, IconButton } from "../components/button"
import { Card, CardBody, CardHeader } from "../components/card"
import { ConfirmDialog } from "../components/dialog"
import { Icon } from "../components/icon"
import { Avatar, Empty, InlineError, PageHeader, Skeleton } from "../components/ui"
import { useToast } from "../components/toast"
import { describeError } from "../api"
import { fullDate, parseUserAgent, timeAgo } from "../lib/format"
import { useSession } from "../session"
import type { Org, Role, SessionRow, User } from "../types"

interface MeResponse {
  user: User
  org: Org
  role: Role
  sessions: SessionRow[]
}

export function AccountPage() {
  const session = useSession()
  const toast = useToast()
  const [target, setTarget] = createSignal<SessionRow>()
  const [revoking, setRevoking] = createSignal(false)

  const [data, { refetch }] = createResource<MeResponse, string | undefined>(
    () => session.orgId(),
    () => session.request<MeResponse>("/api/console/me"),
  )

  const revoke = async () => {
    const row = target()
    if (!row) return
    setRevoking(true)
    try {
      await session.request(`/api/console/me/sessions/${row.id}`, { method: "DELETE" })
      toast.success("Device signed out")
      setTarget(undefined)
      await refetch()
    } catch (cause) {
      toast.error("Could not sign out that device", describeError(cause))
    } finally {
      setRevoking(false)
    }
  }

  const isMember = () => session.session()?.role === "member"

  return (
    <div class="space-y-5">
      <PageHeader
        eyebrow={isMember() ? "Account" : "Account"}
        title={isMember() ? "Your access" : "Account"}
        description={
          isMember()
            ? "Your organization access and the devices connected to Ballm Code."
            : "Your profile, organization role, and connected devices."
        }
        actions={
          <Button variant="danger" onClick={() => void session.signOut()}>
            <Icon name="logout" class="size-4" /> Sign out
          </Button>
        }
      />

      <Show
        when={!data.error}
        fallback={
          <InlineError
            title="Could not load your account"
            description={data.error instanceof Error ? data.error.message : undefined}
            onRetry={() => void refetch()}
          />
        }
      >
        <Show when={data()} fallback={<Skeleton class="h-48" />}>
          {(me) => (
            <div class="grid gap-4 lg:grid-cols-3">
              <Card class="lg:col-span-2">
                <CardHeader title="Profile" />
                <CardBody class="flex flex-wrap items-center gap-4">
                  <Avatar name={me().user.name} email={me().user.email} size="lg" />
                  <div class="min-w-0 flex-1">
                    <p class="text-[15px] font-semibold text-ink">
                      {me().user.name ?? me().user.email.split("@")[0]}
                    </p>
                    <p class="text-[12.5px] text-ink-muted">{me().user.email}</p>
                    <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <RoleBadge role={me().role} />
                      <Badge tone="neutral">{me().org.name}</Badge>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="What your role allows" />
                <CardBody class="space-y-2 text-[12px] leading-5 text-ink-muted">
                  <Show when={me().role === "owner"}>
                    <p>Full control of the organization, including owners, SSO, models, and policies.</p>
                  </Show>
                  <Show when={me().role === "admin"}>
                    <p>Manage members, models, policies, SSO, upstream, sessions, and audit history.</p>
                  </Show>
                  <Show when={me().role === "member"}>
                    <p>Use Ballm Code and manage your own connected devices. Contact an owner to change access.</p>
                  </Show>
                  <p class="border-t border-line pt-2 text-ink-subtle">
                    Sessions are issued by your identity provider and expire after the configured
                    browser and refresh lifetimes.
                  </p>
                </CardBody>
              </Card>
            </div>
          )}
        </Show>
      </Show>

      <Card>
        <CardHeader
          title="Your devices"
          description="Sessions created by the Ballm Code client and this browser."
        />
        <Show
          when={(data()?.sessions.length ?? 0) > 0}
          fallback={
            <Empty
              icon={<Icon name="monitor" class="size-5" />}
              title="No device sessions"
              description="Connect the Ballm Code client from your terminal to create one."
            />
          }
        >
          <ul class="divide-y divide-line">
            <For each={data()?.sessions ?? []}>
              {(row) => {
                const client = () => parseUserAgent(row.user_agent)
                return (
                  <li class="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span class="grid size-8 place-items-center rounded-lg border border-line bg-canvas-elevated text-ink-muted">
                      <Icon name="monitor" class="size-4" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="text-[12.5px] font-medium text-ink">
                        {client().browser} on {client().os}
                      </p>
                      <p class="text-[11px] text-ink-muted">
                        {row.auth_method === "sso" ? "SSO" : row.auth_method === "device" ? "Device approval" : "Development"} ·{" "}
                        {row.ip ?? "unknown address"} · last seen {timeAgo(row.last_seen_at)}
                      </p>
                    </div>
                    <p class="hidden text-[11px] text-ink-subtle sm:block">since {fullDate(row.created_at)}</p>
                    <IconButton label="Sign out this device" onClick={() => setTarget(row)}>
                      <Icon name="logout" class="size-4" />
                    </IconButton>
                  </li>
                )
              }}
            </For>
          </ul>
        </Show>
      </Card>

      <ConfirmDialog
        open={Boolean(target())}
        onOpenChange={(open) => (open ? undefined : setTarget(undefined))}
        title="Sign out device"
        description="The client loses access immediately and must approve a new device code to reconnect."
        confirmLabel="Sign out device"
        loading={revoking()}
        onConfirm={() => void revoke()}
      />
    </div>
  )
}

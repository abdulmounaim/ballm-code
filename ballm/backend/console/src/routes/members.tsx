import { For, Show, createMemo, createResource, createSignal } from "solid-js"
import { Button, IconButton } from "../components/button"
import { Badge, RoleBadge } from "../components/badge"
import { Card } from "../components/card"
import { ConfirmDialog, Modal } from "../components/dialog"
import { Field, Select, TextInput } from "../components/field"
import { CopyButton } from "../components/controls"
import { Icon } from "../components/icon"
import { Avatar, Empty, InlineError, PageHeader, Skeleton } from "../components/ui"
import { useToast } from "../components/toast"
import { describeError } from "../api"
import { fullDate, plural } from "../lib/format"
import { submitForm } from "../lib/form"
import { useSession } from "../session"
import type { Member, Role } from "../types"

interface MembersResponse {
  members: Member[]
  ownerCount: number
}

export function MembersPage() {
  const session = useSession()
  const toast = useToast()
  const [query, setQuery] = createSignal("")
  const [addOpen, setAddOpen] = createSignal(false)
  const [email, setEmail] = createSignal("")
  const [role, setRole] = createSignal<Role>("member")
  const [saving, setSaving] = createSignal(false)
  const [formError, setFormError] = createSignal<string>()
  const [inviteLink, setInviteLink] = createSignal<string>()
  const [pendingRole, setPendingRole] = createSignal<string>()
  const [removeTarget, setRemoveTarget] = createSignal<Member>()
  const [removing, setRemoving] = createSignal(false)

  const [data, { refetch }] = createResource<MembersResponse, string | undefined>(
    () => session.orgId(),
    () => session.request<MembersResponse>("/api/console/members"),
  )

  const [invites, { refetch: refetchInvites }] = createResource(
    () => session.orgId(),
    () => session.request<{ invites: Array<{ id: string; email: string; role: Role; expires_at: string }> }>("/api/console/invites"),
  )

  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase()
    const members = data()?.members ?? []
    if (!needle) return members
    return members.filter(
      (member) =>
        member.email.toLowerCase().includes(needle) ||
        (member.name ?? "").toLowerCase().includes(needle) ||
        member.role.includes(needle),
    )
  })

  const isOwner = () => session.session()?.role === "owner"
  const lastOwner = () => (data()?.ownerCount ?? 0) <= 1

  const canEdit = (member: Member) => {
    if (isOwner()) return true
    if (member.role === "owner") return false
    return true
  }

  const canRemove = (member: Member) => {
    if (isOwner()) return !(member.role === "owner" && lastOwner())
    return member.role === "member"
  }

  const supportedRoles = (): Array<{ value: Role; label: string }> =>
    isOwner()
      ? [
          { value: "member", label: "Member" },
          { value: "admin", label: "Admin" },
          { value: "owner", label: "Owner" },
        ]
      : [
          { value: "member", label: "Member" },
          { value: "admin", label: "Admin" },
        ]

  const addMember = async (event: SubmitEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError(undefined)
    setInviteLink(undefined)
    try {
      const result = await session.request<{ link: string; delivered: boolean }>("/api/console/invites", {
        body: { email: email().trim().toLowerCase(), role: role() },
      })
      if (result.delivered) {
        toast.success("Invitation sent", `${email()} will receive a link to join ${session.org()?.name}.`)
        setAddOpen(false)
      } else {
        setInviteLink(result.link)
        toast.success("Invitation created", "Email delivery is not configured; copy the link instead.")
      }
      setEmail("")
      setRole("member")
      await Promise.all([refetch(), refetchInvites()])
    } catch (cause) {
      setFormError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (id: string, email: string) => {
    try {
      await session.request(`/api/console/invites/${id}`, { method: "DELETE" })
      toast.success("Invitation revoked", `${email} can no longer use that link.`)
      await refetchInvites()
    } catch (cause) {
      toast.error("Could not revoke invitation", describeError(cause))
    }
  }

  const changeRole = async (member: Member, next: Role) => {
    if (next === member.role) return
    setPendingRole(member.id)
    try {
      await session.request(`/api/console/members/${member.id}`, {
        method: "PATCH",
        body: { role: next },
      })
      toast.success("Role updated", `${member.email} is now ${next}.`)
      await refetch()
      if (member.id === session.user()?.id) await session.reload()
    } catch (cause) {
      toast.error("Could not change role", describeError(cause))
      await refetch()
    } finally {
      setPendingRole(undefined)
    }
  }

  const remove = async () => {
    const target = removeTarget()
    if (!target) return
    setRemoving(true)
    try {
      await session.request(`/api/console/members/${target.id}`, { method: "DELETE" })
      toast.success("Member removed", `${target.email} no longer has access.`)
      setRemoveTarget(undefined)
      if (target.id === session.user()?.id) {
        await session.signOut()
        return
      }
      await refetch()
    } catch (cause) {
      toast.error("Could not remove member", describeError(cause))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div class="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Members"
        description="People who can sign in to this organization. Roles control what they can change in the console."
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <Icon name="plus" class="size-4" /> Invite member
          </Button>
        }
      />

      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-56 flex-1 sm:max-w-xs">
          <Icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <TextInput
            class="pl-9"
            placeholder="Search by name, email, or role"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            aria-label="Search members"
          />
        </div>
        <Badge tone="neutral">{plural(data()?.members.length ?? 0, "member")}</Badge>
      </div>

      <Show
        when={!data.error}
        fallback={
          <InlineError
            title="Could not load members"
            description={data.error instanceof Error ? data.error.message : undefined}
            onRetry={() => void refetch()}
          />
        }
      >
        <Card>
          <Show when={!data.loading} fallback={<TableSkeleton />}>
            <Show
              when={filtered().length > 0}
              fallback={
                <Empty
                  icon={<Icon name="users" class="size-5" />}
                  title={query() ? "No matching members" : "No members yet"}
                  description={
                    query()
                      ? "Try a different name, email, or role."
                      : "Add the first person to let them sign in with SSO."
                  }
                  action={
                    query() ? undefined : (
                      <Button variant="primary" onClick={() => setAddOpen(true)}>
                        <Icon name="plus" class="size-4" /> Invite member
                      </Button>
                    )
                  }
                />
              }
            >
              <div class="overflow-x-auto">
                <table class="w-full text-left">
                  <caption class="sr-only">Organization members and their roles</caption>
                  <thead>
                    <tr class="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                      <th scope="col" class="px-4 py-2.5 font-medium">Member</th>
                      <th scope="col" class="hidden px-4 py-2.5 font-medium sm:table-cell">Joined</th>
                      <th scope="col" class="px-4 py-2.5 font-medium">Role</th>
                      <th scope="col" class="w-12 px-2 py-2.5">
                        <span class="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-line">
                    <For each={filtered()}>
                      {(member) => (
                        <tr class="transition-colors hover:bg-surface-hover/60">
                          <td class="px-4 py-3">
                            <div class="flex items-center gap-3">
                              <Avatar name={member.name} email={member.email} />
                              <div class="min-w-0">
                                <p class="flex items-center gap-1.5 truncate text-[13px] font-medium text-ink">
                                  {member.name ?? member.email.split("@")[0]}
                                  <Show when={member.id === session.user()?.id}>
                                    <span class="text-[10.5px] font-normal text-ink-subtle">(you)</span>
                                  </Show>
                                </p>
                                <p class="truncate text-[11.5px] text-ink-muted">{member.email}</p>
                              </div>
                            </div>
                          </td>
                          <td class="hidden px-4 py-3 text-[12px] text-ink-muted sm:table-cell">
                            {fullDate(member.created_at)}
                          </td>
                          <td class="px-4 py-3">
                            <Show
                              when={canEdit(member)}
                              fallback={<RoleBadge role={member.role} />}
                            >
                              <Select
                                class="h-8 w-32 text-[12px]"
                                value={member.role}
                                disabled={pendingRole() === member.id}
                                aria-label={`Role for ${member.email}`}
                                onChange={(event) => void changeRole(member, event.currentTarget.value as Role)}
                                options={supportedRoles().map((option) => ({
                                  ...option,
                                  disabled:
                                    option.value === "owner" &&
                                    (!isOwner() || (member.role === "owner" && lastOwner())),
                                }))}
                              />
                            </Show>
                          </td>
                          <td class="px-2 py-3 text-right">
                            <IconButton
                              label={`Remove ${member.email}`}
                              variant="ghost"
                              disabled={!canRemove(member)}
                              onClick={() => setRemoveTarget(member)}
                            >
                              <Icon name="trash" class="size-4" />
                            </IconButton>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Show>
        </Card>

        <Show when={(invites()?.invites.length ?? 0) > 0}>
          <Card>
            <div class="border-b border-line px-4 py-3">
              <h2 class="text-[13.5px] font-semibold text-ink">Pending invitations</h2>
              <p class="text-[12px] text-ink-muted">Links that have not been accepted yet.</p>
            </div>
            <ul class="divide-y divide-line">
              <For each={invites()?.invites ?? []}>
                {(invite) => (
                  <li class="flex items-center justify-between gap-3 px-4 py-3">
                    <div class="min-w-0">
                      <p class="truncate text-[13px] text-ink">{invite.email}</p>
                      <p class="text-[11.5px] text-ink-muted">Expires {fullDate(invite.expires_at)}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <RoleBadge role={invite.role} />
                      <IconButton
                        label={`Revoke invitation for ${invite.email}`}
                        variant="ghost"
                        onClick={() => void revoke(invite.id, invite.email)}
                      >
                        <Icon name="trash" class="size-4" />
                      </IconButton>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Card>
        </Show>
      </Show>

      <Modal
        open={addOpen()}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) {
            setInviteLink(undefined)
            setFormError(undefined)
          }
        }}
        title="Invite a member"
        description="We email a single-use link. Password accounts and SSO accounts both work."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={saving()}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving()} onClick={() => submitForm("add-member-form")}>
              Send invitation
            </Button>
          </>
        }
      >
        <form id="add-member-form" class="space-y-4" onSubmit={addMember}>
          <Field
            label="Work email"
            for="member-email"
            required
            hint="The link only works for this address."
            error={formError()}
          >
            <TextInput
              id="member-email"
              type="email"
              autocomplete="off"
              placeholder="person@company.com"
              value={email()}
              onInput={(event) => setEmail(event.currentTarget.value)}
              autofocus
            />
          </Field>
          <Field label="Role" for="member-role">
            <Select
              id="member-role"
              value={role()}
              onChange={(event) => setRole(event.currentTarget.value as Role)}
              options={supportedRoles()}
            />
          </Field>
          <Show when={inviteLink()}>
            <div class="space-y-2 rounded-lg border border-line bg-canvas-elevated p-3">
              <p class="text-[12px] font-medium text-ink">Invitation link</p>
              <p class="break-all font-mono text-[11px] leading-5 text-ink-muted">{inviteLink()}</p>
              <CopyButton value={inviteLink()!} label="Copy link" />
            </div>
          </Show>
          <p class="rounded-lg border border-line bg-canvas-elevated px-3 py-2 text-[11.5px] leading-5 text-ink-muted">
            <span class="font-medium text-ink">Member</span> can use Ballm Code.{" "}
            <span class="font-medium text-ink">Admin</span> can manage this org.{" "}
            <span class="font-medium text-ink">Owner</span> can also change owners.
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget())}
        onOpenChange={(open) => (open ? undefined : setRemoveTarget(undefined))}
        title="Remove member"
        description={`Remove ${removeTarget()?.email ?? "this person"} from ${session.org()?.name}? Their current sessions will be revoked.`}
        confirmLabel="Remove member"
        loading={removing()}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function TableSkeleton() {
  return (
    <div class="divide-y divide-line" aria-hidden="true">
      <For each={[0, 1, 2, 3]}>
        {() => (
          <div class="flex items-center gap-3 px-4 py-3">
            <Skeleton class="size-9 rounded-full" />
            <div class="flex-1 space-y-1.5">
              <Skeleton class="h-3 w-40" />
              <Skeleton class="h-2.5 w-56" />
            </div>
            <Skeleton class="h-7 w-24" />
          </div>
        )}
      </For>
    </div>
  )
}

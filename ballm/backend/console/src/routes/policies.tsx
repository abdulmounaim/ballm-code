import { For, Show, createEffect, createResource, createSignal, on } from "solid-js"
import { Badge } from "../components/badge"
import { Button, IconButton } from "../components/button"
import { Card, CardBody, CardHeader } from "../components/card"
import { Icon } from "../components/icon"
import { InlineError, PageHeader, Skeleton } from "../components/ui"
import { useToast } from "../components/toast"
import { describeError } from "../api"
import { plural } from "../lib/format"
import { useSession } from "../session"
import type { PolicyStatement } from "../types"

interface PolicyRow extends PolicyStatement {
  key: string
}

interface PoliciesResponse {
  statements: PolicyStatement[]
  inherited: boolean
  defaults: PolicyStatement[]
}

const actions = [
  "provider.use",
  "integration.connect",
  "integration.use",
  "mcp.use",
  "websearch.use",
  "plugin.use",
  "model.use",
]

export function PoliciesPage() {
  const session = useSession()
  const toast = useToast()
  const [rows, setRows] = createSignal<PolicyRow[]>([])
  const [inherited, setInherited] = createSignal(false)
  const [defaults, setDefaults] = createSignal<PolicyStatement[]>([])
  const [saving, setSaving] = createSignal(false)

  const [data, { refetch }] = createResource<PoliciesResponse, string | undefined>(
    () => session.orgId(),
    () => session.request<PoliciesResponse>("/api/console/policies"),
  )

  const toRows = (statements: PolicyStatement[]) =>
    statements.map((statement) => ({ ...statement, key: crypto.randomUUID() }))

  createEffect(
    on(data, (value) => {
      if (!value) return
      setRows(toRows(value.statements))
      setInherited(value.inherited)
      setDefaults(value.defaults)
    }),
  )

  const dirty = () => {
    const before = JSON.stringify((data()?.statements ?? []).map(clean))
    const after = JSON.stringify(rows().map(clean))
    return before !== after
  }

  const update = (key: string, patch: Partial<PolicyStatement>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const save = async () => {
    setSaving(true)
    try {
      await session.request("/api/console/policies", {
        method: "PUT",
        body: { statements: rows().map(clean) },
      })
      toast.success("Policies saved", "Clients receive the change on their next config refresh.")
      await refetch()
    } catch (cause) {
      toast.error("Could not save policies", describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Policies"
        description="The policy list delivered to clients. It is the baseline for unmanaged machines; managed policy still outranks it."
        actions={
          <>
            <Button variant="ghost" onClick={() => setRows(toRows(defaults()))}>
              Restore defaults
            </Button>
            <Button variant="primary" loading={saving()} disabled={!dirty()} onClick={() => void save()}>
              Save policies
            </Button>
          </>
        }
      />

      <div class="rounded-xl border border-line bg-surface/60 p-4">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-info-soft text-info">
            <Icon name="info" class="size-3.5" />
          </span>
          <div class="space-y-1 text-[12.5px] leading-5 text-ink-muted">
            <p>
              Statements are evaluated by the client and deny by default. The shipped default denies
              every provider and integration except <code class="font-mono text-ink">ballm</code>.
            </p>
            <p>
              Removing the <code class="font-mono text-ink">provider.use: ballm</code> allow will make
              the client unusable for this organization.
            </p>
          </div>
        </div>
      </div>

      <Show
        when={!data.error}
        fallback={
          <InlineError
            title="Could not load policies"
            description={data.error instanceof Error ? data.error.message : undefined}
            onRetry={() => void refetch()}
          />
        }
      >
        <Card>
          <CardHeader
            title="Delivered statements"
            description={plural(rows().length, "statement")}
            actions={
              <Badge tone={inherited() && !dirty() ? "neutral" : "accent"}>
                {inherited() && !dirty() ? "Defaults" : "Custom"}
              </Badge>
            }
          />
          <Show when={!data.loading} fallback={<PolicySkeleton />}>
            <div class="overflow-x-auto">
              <table class="w-full text-left">
                <caption class="sr-only">Policy statements</caption>
                <thead>
                  <tr class="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                    <th scope="col" class="px-4 py-2.5 font-medium">Action</th>
                    <th scope="col" class="px-4 py-2.5 font-medium">Resource</th>
                    <th scope="col" class="w-32 px-4 py-2.5 font-medium">Effect</th>
                    <th scope="col" class="w-12 px-2 py-2.5"><span class="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-line">
                  <For each={rows()}>
                    {(row) => (
                      <tr class="align-middle">
                        <td class="px-4 py-2.5">
                          <input
                            list="policy-actions"
                            value={row.action}
                            aria-label="Action"
                            class="h-8 w-full min-w-40 rounded-md border border-line bg-canvas-elevated px-2 font-mono text-[11.5px] text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                            onInput={(event) => update(row.key, { action: event.currentTarget.value })}
                          />
                        </td>
                        <td class="px-4 py-2.5">
                          <input
                            value={row.resource}
                            aria-label="Resource"
                            class="h-8 w-full min-w-32 rounded-md border border-line bg-canvas-elevated px-2 font-mono text-[11.5px] text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                            onInput={(event) => update(row.key, { resource: event.currentTarget.value })}
                          />
                        </td>
                        <td class="px-4 py-2.5">
                          <select
                            value={row.effect}
                            aria-label="Effect"
                            class="h-8 w-full rounded-md border border-line bg-canvas-elevated px-2 text-[12px] text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                            onChange={(event) =>
                              update(row.key, { effect: event.currentTarget.value as "allow" | "deny" })
                            }
                          >
                            <option value="allow" selected={row.effect === "allow"}>
                              Allow
                            </option>
                            <option value="deny" selected={row.effect === "deny"}>
                              Deny
                            </option>
                          </select>
                        </td>
                        <td class="px-2 py-2.5 text-right">
                          <IconButton
                            label={`Remove ${row.action || "statement"}`}
                            onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
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

            <datalist id="policy-actions">
              <For each={actions}>{(action) => <option value={action} />}</For>
            </datalist>

            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <Button
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    { key: crypto.randomUUID(), action: "provider.use", resource: "", effect: "allow" },
                  ])
                }
              >
                <Icon name="plus" class="size-4" /> Add statement
              </Button>
              <Show when={dirty()}>
                <div class="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setRows(toRows(data()?.statements ?? []))}>
                    Discard
                  </Button>
                  <Button variant="primary" loading={saving()} onClick={() => void save()}>
                    Save changes
                  </Button>
                </div>
              </Show>
            </div>
          </Show>
        </Card>
      </Show>

      <Card>
        <CardHeader title="How the client applies this" />
        <CardBody class="grid gap-4 text-[12.5px] leading-6 text-ink-muted sm:grid-cols-3">
          <div>
            <p class="mb-1 font-medium text-ink">1. Managed policy</p>
            A root-owned file or MDM profile. It cannot be overridden and wins over everything below.
          </div>
          <div>
            <p class="mb-1 font-medium text-ink">2. Delivered policy</p>
            This list, served from <code class="font-mono text-ink">/api/v2/config</code> and cached by
            the client.
          </div>
          <div>
            <p class="mb-1 font-medium text-ink">3. User and project config</p>
            Applied last. It can narrow access but never widen the statements above.
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function clean(statement: PolicyStatement): PolicyStatement {
  return { action: statement.action.trim(), resource: statement.resource.trim(), effect: statement.effect }
}

function PolicySkeleton() {
  return (
    <div class="divide-y divide-line" aria-hidden="true">
      <For each={[0, 1, 2, 3, 4]}>
        {() => (
          <div class="flex gap-3 px-4 py-3">
            <Skeleton class="h-8 flex-1" />
            <Skeleton class="h-8 flex-1" />
            <Skeleton class="h-8 w-24" />
          </div>
        )}
      </For>
    </div>
  )
}

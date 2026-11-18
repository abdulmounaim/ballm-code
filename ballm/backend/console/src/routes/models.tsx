import { For, Show, createEffect, createMemo, createResource, createSignal, on } from "solid-js"
import { Badge } from "../components/badge"
import { Button, IconButton } from "../components/button"
import { Card, CardHeader } from "../components/card"
import { Modal } from "../components/dialog"
import { Field, Switch, TextInput } from "../components/field"
import { Icon } from "../components/icon"
import { Segmented } from "../components/controls"
import { Empty, InlineError, PageHeader, Skeleton } from "../components/ui"
import { useToast } from "../components/toast"
import { describeError } from "../api"
import { compactNumber, plural } from "../lib/format"
import { submitForm } from "../lib/form"
import { useSession } from "../session"
import type { CatalogModel } from "../types"

interface ModelsResponse {
  models: CatalogModel[]
}

interface ModelDraft {
  id: string
  name: string
  upstreamModel: string
  contextLimit: string
  outputLimit: string
  enabled: boolean
}

const emptyDraft: ModelDraft = {
  id: "",
  name: "",
  upstreamModel: "",
  contextLimit: "",
  outputLimit: "",
  enabled: true,
}

export function ModelsPage() {
  const session = useSession()
  const toast = useToast()
  const [tab, setTab] = createSignal<"allowlist" | "catalog">("allowlist")
  const [query, setQuery] = createSignal("")
  const [enabled, setEnabled] = createSignal<string[]>([])
  const [saving, setSaving] = createSignal(false)
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [draft, setDraft] = createSignal<ModelDraft>(emptyDraft)
  const [editing, setEditing] = createSignal(false)
  const [savingModel, setSavingModel] = createSignal(false)
  const [formError, setFormError] = createSignal<string>()

  const [data, { refetch }] = createResource<ModelsResponse, string | undefined>(
    () => session.orgId(),
    () => session.request<ModelsResponse>("/api/console/models"),
  )

  createEffect(
    on(data, (value) => {
      if (!value) return
      setEnabled(value.models.filter((model) => model.org_enabled).map((model) => model.id))
    }),
  )

  const models = () => data()?.models ?? []

  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase()
    if (!needle) return models()
    return models().filter(
      (model) =>
        model.id.toLowerCase().includes(needle) ||
        model.name.toLowerCase().includes(needle) ||
        model.upstream_model.toLowerCase().includes(needle),
    )
  })

  const original = createMemo(() =>
    models()
      .filter((model) => model.org_enabled)
      .map((model) => model.id)
      .sort(),
  )
  const dirty = createMemo(() => enabled().slice().sort().join(",") !== original().join(","))

  const toggle = (id: string, next: boolean) => {
    setEnabled((current) => (next ? [...new Set([...current, id])] : current.filter((item) => item !== id)))
  }

  const saveAllowlist = async () => {
    setSaving(true)
    try {
      await session.request("/api/console/models", { method: "PUT", body: { modelIds: enabled() } })
      toast.success("Allowlist saved", "Clients receive the change on their next config refresh.")
      await refetch()
    } catch (cause) {
      toast.error("Could not save the allowlist", describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  const openCreate = () => {
    setEditing(false)
    setDraft(emptyDraft)
    setFormError(undefined)
    setDialogOpen(true)
  }

  const openEdit = (model: CatalogModel) => {
    setEditing(true)
    setDraft({
      id: model.id,
      name: model.name,
      upstreamModel: model.upstream_model,
      contextLimit: model.context_limit ? String(model.context_limit) : "",
      outputLimit: model.output_limit ? String(model.output_limit) : "",
      enabled: model.enabled,
    })
    setFormError(undefined)
    setDialogOpen(true)
  }

  const saveModel = async (event: SubmitEvent) => {
    event.preventDefault()
    setSavingModel(true)
    setFormError(undefined)
    try {
      await session.request(`/api/console/models/${encodeURIComponent(draft().id)}`, {
        method: "PUT",
        body: {
          id: draft().id,
          name: draft().name,
          upstreamModel: draft().upstreamModel,
          ...(draft().contextLimit ? { contextLimit: Number(draft().contextLimit) } : {}),
          ...(draft().outputLimit ? { outputLimit: Number(draft().outputLimit) } : {}),
          enabled: draft().enabled,
        },
      })
      toast.success(editing() ? "Model updated" : "Model created")
      setDialogOpen(false)
      await refetch()
    } catch (cause) {
      setFormError(describeError(cause))
    } finally {
      setSavingModel(false)
    }
  }

  return (
    <div class="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Models"
        description="The catalog maps Ballm model IDs to upstream model IDs. The allowlist decides which models this organization can request."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Icon name="plus" class="size-4" /> Add model
          </Button>
        }
      />

      <div class="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Model view"
          value={tab()}
          onChange={setTab}
          options={[
            { value: "allowlist", label: "Allowlist" },
            { value: "catalog", label: "Catalog" },
          ]}
        />
        <div class="relative min-w-52 flex-1 sm:max-w-xs">
          <Icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <TextInput
            class="pl-9"
            placeholder="Filter models"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            aria-label="Filter models"
          />
        </div>
      </div>

      <Show
        when={!data.error}
        fallback={
          <InlineError
            title="Could not load models"
            description={data.error instanceof Error ? data.error.message : undefined}
            onRetry={() => void refetch()}
          />
        }
      >
        <Show when={!data.loading} fallback={<ModelsSkeleton />}>
          <Show when={tab() === "allowlist"} fallback={<CatalogTable models={filtered()} onEdit={openEdit} />}>
            <Card>
              <CardHeader
                title="Organization allowlist"
                description="Only these models are accepted by the gateway for this organization."
                actions={
                  <Badge tone={enabled().length > 0 ? "success" : "warning"} dot>
                    {enabled().length} of {models().length} enabled
                  </Badge>
                }
              />
              <Show
                when={filtered().length > 0}
                fallback={
                  <Empty
                    icon={<Icon name="chip" class="size-5" />}
                    title={query() ? "No matching models" : "The catalog is empty"}
                    description={
                      query()
                        ? "Try a different model name or ID."
                        : "Add a model to the catalog before building the allowlist."
                    }
                    action={
                      <Button variant="primary" onClick={openCreate}>
                        <Icon name="plus" class="size-4" /> Add model
                      </Button>
                    }
                  />
                }
              >
                <ul class="divide-y divide-line">
                  <For each={filtered()}>
                    {(model) => (
                      <li class="flex items-center gap-4 px-5 py-3">
                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-[13px] font-medium text-ink">{model.name}</p>
                            <code class="rounded bg-surface-strong px-1.5 py-0.5 font-mono text-[10.5px] text-ink-muted">
                              {model.id}
                            </code>
                            <Show when={!model.enabled}>
                              <Badge tone="warning">Catalog disabled</Badge>
                            </Show>
                          </div>
                          <p class="mt-0.5 truncate text-[11.5px] text-ink-subtle">
                            Upstream <span class="font-mono">{model.upstream_model}</span>
                            {model.context_limit ? ` · ${compactNumber(model.context_limit)} context` : ""}
                            {model.output_limit ? ` · ${compactNumber(model.output_limit)} output` : ""}
                          </p>
                        </div>
                        <Switch
                          hideLabel
                          checked={enabled().includes(model.id)}
                          disabled={!model.enabled}
                          onChange={(next) => toggle(model.id, next)}
                          label={`Enable ${model.name}`}
                        />
                      </li>
                    )}
                  </For>
                </ul>
              </Show>

              <Show when={dirty()}>
                <div class="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">
                  <p class="text-[12px] text-ink-muted">
                    {plural(enabled().length, "model")} will be available to this organization.
                  </p>
                  <div class="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => setEnabled(models().filter((model) => model.org_enabled).map((model) => model.id))}
                    >
                      Discard
                    </Button>
                    <Button variant="primary" loading={saving()} onClick={() => void saveAllowlist()}>
                      Save changes
                    </Button>
                  </div>
                </div>
              </Show>
            </Card>
          </Show>
        </Show>
      </Show>

      <Modal
        open={dialogOpen()}
        onOpenChange={setDialogOpen}
        title={editing() ? "Edit catalog model" : "Add catalog model"}
        description="Catalog changes are global. The organization allowlist decides who can use the model."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={savingModel()}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={savingModel()}
              onClick={() => submitForm("model-form")}
            >
              {editing() ? "Save model" : "Create model"}
            </Button>
          </>
        }
      >
        <form id="model-form" class="space-y-4" onSubmit={saveModel}>
          <div class="grid gap-4 sm:grid-cols-2">
            <Field label="Model ID" for="model-id" required hint="What clients request." error={formError()}>
              <TextInput
                id="model-id"
                value={draft().id}
                readOnly={editing()}
                class="font-mono"
                placeholder="ballm-fast"
                onInput={(event) => setDraft({ ...draft(), id: event.currentTarget.value })}
              />
            </Field>
            <Field label="Display name" for="model-name" required>
              <TextInput
                id="model-name"
                value={draft().name}
                placeholder="Ballm Fast"
                onInput={(event) => setDraft({ ...draft(), name: event.currentTarget.value })}
              />
            </Field>
          </div>
          <Field label="Upstream model" for="model-upstream" required hint="The provider's model identifier.">
            <TextInput
              id="model-upstream"
              value={draft().upstreamModel}
              class="font-mono"
              placeholder="claude-sonnet-4-5"
              onInput={(event) => setDraft({ ...draft(), upstreamModel: event.currentTarget.value })}
            />
          </Field>
          <div class="grid gap-4 sm:grid-cols-2">
            <Field label="Context limit" for="model-context" hint="Tokens. Optional.">
              <TextInput
                id="model-context"
                type="number"
                min="1"
                value={draft().contextLimit}
                placeholder="200000"
                onInput={(event) => setDraft({ ...draft(), contextLimit: event.currentTarget.value })}
              />
            </Field>
            <Field label="Output limit" for="model-output" hint="Tokens. Optional.">
              <TextInput
                id="model-output"
                type="number"
                min="1"
                value={draft().outputLimit}
                placeholder="32000"
                onInput={(event) => setDraft({ ...draft(), outputLimit: event.currentTarget.value })}
              />
            </Field>
          </div>
          <div class="rounded-lg border border-line bg-canvas-elevated p-3">
            <Switch
              checked={draft().enabled}
              onChange={(next) => setDraft({ ...draft(), enabled: next })}
              label="Model enabled"
              description="Disabled models can stay on an allowlist but are never served."
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}

function CatalogTable(props: { models: CatalogModel[]; onEdit: (model: CatalogModel) => void }) {
  return (
    <Card>
      <CardHeader
        title="Model catalog"
        description="Ballm model IDs and the upstream models they resolve to."
      />
      <Show
        when={props.models.length > 0}
        fallback={
          <Empty
            icon={<Icon name="chip" class="size-5" />}
            title="No models in the catalog"
            description="Add a model to make it available for allowlists."
          />
        }
      >
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <caption class="sr-only">Catalog models</caption>
            <thead>
              <tr class="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                <th scope="col" class="px-4 py-2.5 font-medium">Model</th>
                <th scope="col" class="hidden px-4 py-2.5 font-medium md:table-cell">Upstream</th>
                <th scope="col" class="hidden px-4 py-2.5 font-medium lg:table-cell">Limits</th>
                <th scope="col" class="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" class="w-12 px-2 py-2.5"><span class="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              <For each={props.models}>
                {(model) => (
                  <tr class="transition-colors hover:bg-surface-hover/60">
                    <td class="px-4 py-3">
                      <p class="text-[13px] font-medium text-ink">{model.name}</p>
                      <code class="font-mono text-[11px] text-ink-subtle">{model.id}</code>
                    </td>
                    <td class="hidden px-4 py-3 font-mono text-[11.5px] text-ink-muted md:table-cell">
                      {model.upstream_model}
                    </td>
                    <td class="hidden px-4 py-3 text-[11.5px] text-ink-muted lg:table-cell">
                      {model.context_limit ? `${compactNumber(model.context_limit)} ctx` : "—"}
                      {model.output_limit ? ` · ${compactNumber(model.output_limit)} out` : ""}
                    </td>
                    <td class="px-4 py-3">
                      <Badge tone={model.enabled ? "success" : "neutral"} dot>
                        {model.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </td>
                    <td class="px-2 py-3 text-right">
                      <IconButton label={`Edit ${model.name}`} onClick={() => props.onEdit(model)}>
                        <Icon name="edit" class="size-4" />
                      </IconButton>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </Card>
  )
}

function ModelsSkeleton() {
  return (
    <Card>
      <div class="divide-y divide-line" aria-hidden="true">
        <For each={[0, 1, 2, 3]}>
          {() => (
            <div class="flex items-center gap-4 px-5 py-4">
              <div class="flex-1 space-y-2">
                <Skeleton class="h-3.5 w-40" />
                <Skeleton class="h-2.5 w-64" />
              </div>
              <Skeleton class="h-6 w-10 rounded-full" />
            </div>
          )}
        </For>
      </div>
    </Card>
  )
}

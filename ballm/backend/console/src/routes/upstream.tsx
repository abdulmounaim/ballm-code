import { Show, createEffect, createResource, createSignal, on } from "solid-js"
import { Badge } from "../components/badge"
import { Button } from "../components/button"
import { Card, CardBody, CardHeader } from "../components/card"
import { ConfirmDialog } from "../components/dialog"
import { Field, SecretInput, TextInput } from "../components/field"
import { Icon } from "../components/icon"
import { FieldRow } from "../components/controls"
import { InlineError, PageHeader, Skeleton } from "../components/ui"
import { useToast } from "../components/toast"
import { describeError } from "../api"
import { submitForm } from "../lib/form"
import { useSession } from "../session"
import type { UpstreamConfig, UpstreamTestResult } from "../types"

export function UpstreamPage() {
  const session = useSession()
  const toast = useToast()
  const [baseUrl, setBaseUrl] = createSignal("")
  const [apiKey, setApiKey] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [testing, setTesting] = createSignal(false)
  const [result, setResult] = createSignal<UpstreamTestResult>()
  const [error, setError] = createSignal<string>()
  const [clearOpen, setClearOpen] = createSignal(false)
  const [clearing, setClearing] = createSignal(false)

  const [data, { refetch }] = createResource<UpstreamConfig, string | undefined>(
    () => session.orgId(),
    () => session.request<UpstreamConfig>("/api/console/upstream"),
  )

  createEffect(
    on(data, (value) => {
      if (!value) return
      setBaseUrl(value.baseUrl ?? "")
      setApiKey("")
    }),
  )

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      await session.request("/api/console/upstream", {
        method: "PUT",
        body: {
          baseUrl: baseUrl().trim() || null,
          ...(apiKey() ? { apiKey: apiKey() } : {}),
        },
      })
      toast.success("Upstream saved", "Gateways receive the change through the catalog cache.")
      setApiKey("")
      setResult(undefined)
      await refetch()
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setResult(undefined)
    try {
      const response = await session.request<UpstreamTestResult>("/api/console/upstream/test", { method: "POST" })
      setResult(response)
    } catch (cause) {
      setResult({ ok: false, status: 0, latencyMs: 0, message: describeError(cause) })
    } finally {
      setTesting(false)
    }
  }

  const clearKey = async () => {
    setClearing(true)
    try {
      await session.request("/api/console/upstream", { method: "PUT", body: { apiKey: null } })
      toast.success("API key cleared")
      setClearOpen(false)
      await refetch()
    } catch (cause) {
      toast.error("Could not clear the key", describeError(cause))
    } finally {
      setClearing(false)
    }
  }

  return (
    <div class="space-y-5">
      <PageHeader
        eyebrow="Security"
        title="Upstream"
        description="Where the gateway sends approved model traffic. The key is encrypted before it is stored and never returned to a browser."
        actions={
          <Button variant="primary" loading={saving()} onClick={() => submitForm("upstream-form")}>
            Save upstream
          </Button>
        }
      />

      <Show
        when={!data.error}
        fallback={
          <InlineError
            title="Could not load the upstream configuration"
            description={data.error instanceof Error ? data.error.message : undefined}
            onRetry={() => void refetch()}
          />
        }
      >
        <Show when={!data.loading} fallback={<Skeleton class="h-80" />}>
          <form id="upstream-form" class="space-y-4" onSubmit={save}>
            <Show when={error()}>
              <div class="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft/60 p-3" role="alert">
                <Icon name="alert" class="mt-0.5 size-4 shrink-0 text-danger" />
                <p class="text-[12.5px] leading-5 text-ink">{error()}</p>
              </div>
            </Show>

            <Card>
              <CardHeader
                title="Model upstream"
                description="An OpenAI-compatible endpoint. The gateway rewrites Ballm model IDs before forwarding."
                actions={
                  <Badge tone={baseUrl() ? "success" : "warning"} dot>
                    {baseUrl() ? "Configured" : data()?.fallbackConfigured ? "Using fallback" : "Not configured"}
                  </Badge>
                }
              />
              <CardBody class="space-y-4">
                <Field
                  label="Base URL"
                  for="upstream-url"
                  hint={
                    data()?.fallbackConfigured
                      ? "Leave blank to use the deployment-wide fallback upstream."
                      : "Include the API version path, for example https://api.example.com/v1."
                  }
                >
                  <TextInput
                    id="upstream-url"
                    value={baseUrl()}
                    placeholder="https://api.example.com/v1"
                    autocomplete="off"
                    spellcheck={false}
                    onInput={(event) => setBaseUrl(event.currentTarget.value)}
                  />
                </Field>

                <Field
                  label="API key"
                  for="upstream-key"
                  hint={data()?.hasApiKey ? "A key is stored. Leave blank to keep it." : "Sent as a bearer token to the upstream."}
                >
                  <SecretInput
                    id="upstream-key"
                    value={apiKey()}
                    placeholder={data()?.hasApiKey ? "••••••••••••••••" : "sk-..."}
                    autocomplete="new-password"
                    onInput={(event) => setApiKey(event.currentTarget.value)}
                  />
                </Field>

                <div class="flex flex-wrap items-center gap-2">
                  <Button type="button" loading={testing()} onClick={() => void test()}>
                    <Icon name="activity" class="size-4" /> Test saved connection
                  </Button>
                  <Show when={data()?.hasApiKey}>
                    <Button type="button" variant="danger" onClick={() => setClearOpen(true)}>
                      Clear stored key
                    </Button>
                  </Show>
                </div>

                <Show when={result()}>
                  {(value) => (
                    <div
                      class={
                        value().ok
                          ? "flex items-start gap-3 rounded-lg border border-success/25 bg-success-soft/60 p-3"
                          : "flex items-start gap-3 rounded-lg border border-danger/25 bg-danger-soft/60 p-3"
                      }
                    >
                      <Icon
                        name={value().ok ? "check" : "alert"}
                        class={value().ok ? "mt-0.5 size-4 shrink-0 text-success" : "mt-0.5 size-4 shrink-0 text-danger"}
                      />
                      <div class="min-w-0 flex-1">
                        <p class="text-[12.5px] font-medium text-ink">{value().message}</p>
                        <p class="text-[11.5px] text-ink-muted">
                          {value().latencyMs} ms
                          {value().status ? ` · HTTP ${value().status}` : ""}
                        </p>
                      </div>
                    </div>
                  )}
                </Show>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Current configuration" />
              <CardBody class="py-1">
                <FieldRow label="Organization base URL" value={data()?.baseUrl ?? "Not set"} mono />
                <FieldRow label="Deployment fallback" value={data()?.fallbackConfigured ? "Available" : "Not set"} />
                <FieldRow label="API key" value={data()?.hasApiKey ? "Stored and encrypted" : "Not set"} />
              </CardBody>
            </Card>
          </form>
        </Show>
      </Show>

      <ConfirmDialog
        open={clearOpen()}
        onOpenChange={setClearOpen}
        title="Clear upstream API key"
        description="Requests will fail until a new key is stored or the upstream does not require one."
        confirmLabel="Clear key"
        loading={clearing()}
        onConfirm={() => void clearKey()}
      />
    </div>
  )
}

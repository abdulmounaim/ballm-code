import { For, Show, createEffect, createResource, createSignal, on } from "solid-js"
import { Badge } from "../components/badge"
import { Button, IconButton } from "../components/button"
import { Card, CardBody, CardHeader } from "../components/card"
import { CopyButton, FieldRow, TagInput } from "../components/controls"
import { Field, SecretInput, Select, Switch, TextInput } from "../components/field"
import { Icon } from "../components/icon"
import { InlineError, PageHeader, Skeleton } from "../components/ui"
import { useToast } from "../components/toast"
import { describeError } from "../api"
import { submitForm } from "../lib/form"
import { useSession } from "../session"
import type { Role, SsoConfig } from "../types"

interface GroupRow {
  key: string
  group: string
  role: Role
}

export function IdentityPage() {
  const session = useSession()
  const toast = useToast()
  const [issuer, setIssuer] = createSignal("")
  const [clientId, setClientId] = createSignal("")
  const [clientSecret, setClientSecret] = createSignal("")
  const [scopes, setScopes] = createSignal("openid email profile")
  const [domains, setDomains] = createSignal<string[]>([])
  const [groupClaim, setGroupClaim] = createSignal("")
  const [groups, setGroups] = createSignal<GroupRow[]>([])
  const [enabled, setEnabled] = createSignal(true)
  const [saving, setSaving] = createSignal(false)
  const [formError, setFormError] = createSignal<string>()
  const [testing, setTesting] = createSignal(false)
  const [testResult, setTestResult] = createSignal<{
    ok: boolean
    message?: string
    issuer?: string
    authorizationEndpoint?: string
    tokenEndpoint?: string
    jwksUri?: string
  }>()

  const [data, { refetch }] = createResource<SsoConfig, string | undefined>(
    () => session.orgId(),
    () => session.request<SsoConfig>("/api/console/sso"),
  )

  createEffect(
    on(data, (value) => {
      if (!value) return
      setIssuer(value.issuer ?? "")
      setClientId(value.clientId ?? "")
      setClientSecret("")
      setScopes(value.scopes ?? "openid email profile")
      setDomains(value.allowedDomains ?? [])
      setGroupClaim(value.groupClaim ?? "")
      setGroups(
        Object.entries(value.groupRoles ?? {}).map(([group, role]) => ({
          key: crypto.randomUUID(),
          group,
          role,
        })),
      )
      setEnabled(value.enabled ?? true)
    }),
  )

  const redirectUri = () => data()?.redirectUri ?? `${window.location.origin}/auth/sso/callback`

  const testDiscovery = async () => {
    setTesting(true)
    setTestResult(undefined)
    try {
      const result = await session.request<{
        ok: boolean
        message?: string
        issuer?: string
        authorizationEndpoint?: string
        tokenEndpoint?: string
        jwksUri?: string
      }>("/api/console/sso/test", { method: "POST", body: { issuer: issuer().trim() } })
      setTestResult(result)
    } catch (cause) {
      setTestResult({ ok: false, message: describeError(cause) })
    } finally {
      setTesting(false)
    }
  }

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError(undefined)
    try {
      await session.request("/api/console/sso", {
        method: "PUT",
        body: {
          issuer: issuer().trim().replace(/\/+$/, ""),
          clientId: clientId().trim(),
          ...(clientSecret() ? { clientSecret: clientSecret() } : {}),
          scopes: scopes().trim(),
          allowedDomains: domains(),
          ...(groupClaim().trim() ? { groupClaim: groupClaim().trim() } : {}),
          groupRoles: Object.fromEntries(
            groups()
              .filter((row) => row.group.trim())
              .map((row) => [row.group.trim(), row.role]),
          ),
          enabled: enabled(),
        },
      })
      toast.success("SSO connection saved", "New sign-ins use the updated configuration.")
      setClientSecret("")
      await refetch()
    } catch (cause) {
      setFormError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="space-y-5">
      <PageHeader
        eyebrow="Security"
        title="Identity"
        description="The OIDC connection used for console sign-in and device approval. Every session in this organization is created through it."
        actions={
          <Button variant="primary" loading={saving()} onClick={() => submitForm("sso-form")}>
            Save connection
          </Button>
        }
      />

      <Show
        when={!data.error}
        fallback={
          <InlineError
            title="Could not load the SSO connection"
            description={data.error instanceof Error ? data.error.message : undefined}
            onRetry={() => void refetch()}
          />
        }
      >
        <Show when={!data.loading} fallback={<IdentitySkeleton />}>
          <form id="sso-form" class="space-y-4" onSubmit={save}>
            <Show when={formError()}>
              <div class="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft/60 p-3" role="alert">
                <Icon name="alert" class="mt-0.5 size-4 shrink-0 text-danger" />
                <p class="text-[12.5px] leading-5 text-ink">{formError()}</p>
              </div>
            </Show>

            <Card>
              <CardHeader
                title="Provider"
                description="Any OIDC provider with discovery and JWKS works."
                actions={
                  <Badge tone={data()?.configured ? (enabled() ? "success" : "warning") : "neutral"} dot>
                    {data()?.configured ? (enabled() ? "Connected" : "Disabled") : "Not configured"}
                  </Badge>
                }
              />
              <CardBody class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2 sm:col-span-2">
                  <Field
                    label="Issuer URL"
                    for="sso-issuer"
                    required
                    hint="Discovery is read from <issuer>/.well-known/openid-configuration."
                  >
                    <TextInput
                      id="sso-issuer"
                      value={issuer()}
                      placeholder="https://idp.example.com/realms/ballm"
                      autocomplete="off"
                      spellcheck={false}
                      onInput={(event) => setIssuer(event.currentTarget.value)}
                    />
                  </Field>
                  <div class="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" loading={testing()} onClick={() => void testDiscovery()}>
                      <Icon name="activity" class="size-3.5" /> Test discovery
                    </Button>
                    <Show when={testResult()}>
                      {(result) => (
                        <div
                          class={
                            result().ok
                              ? "flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-success/25 bg-success-soft/60 px-2.5 py-1.5"
                              : "flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-danger/25 bg-danger-soft/60 px-2.5 py-1.5"
                          }
                        >
                          <Icon
                            name={result().ok ? "check" : "alert"}
                            class={result().ok ? "size-3.5 shrink-0 text-success" : "size-3.5 shrink-0 text-danger"}
                          />
                          <p class="min-w-0 truncate text-[11.5px] text-ink-muted">
                            {result().ok
                              ? `Discovery OK · ${result().issuer}`
                              : result().message}
                          </p>
                        </div>
                      )}
                    </Show>
                  </div>
                </div>
                <Field label="Client ID" for="sso-client-id" required>
                  <TextInput
                    id="sso-client-id"
                    value={clientId()}
                    placeholder="ballm-code"
                    autocomplete="off"
                    spellcheck={false}
                    onInput={(event) => setClientId(event.currentTarget.value)}
                  />
                </Field>
                <Field
                  label="Client secret"
                  for="sso-client-secret"
                  hint={data()?.hasClientSecret ? "A secret is stored. Leave blank to keep it." : "Required for a new connection."}
                >
                  <SecretInput
                    id="sso-client-secret"
                    value={clientSecret()}
                    placeholder={data()?.hasClientSecret ? "••••••••••••••••" : "Client secret"}
                    autocomplete="new-password"
                    onInput={(event) => setClientSecret(event.currentTarget.value)}
                  />
                </Field>
                <Field class="sm:col-span-2" label="Scopes" for="sso-scopes" hint="Space separated.">
                  <TextInput
                    id="sso-scopes"
                    value={scopes()}
                    class="font-mono text-[12px]"
                    onInput={(event) => setScopes(event.currentTarget.value)}
                  />
                </Field>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Allowed access" description="Who may sign in and how the connection is used." />
              <CardBody class="space-y-5">
                <Field
                  label="Allowed email domains"
                  for="sso-domains"
                  hint="Press Enter or comma after each domain. At least one domain is required for email-based sign-in."
                >
                  <TagInput
                    id="sso-domains"
                    values={domains()}
                    onChange={setDomains}
                    placeholder="ballm.internal"
                  />
                </Field>
                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="rounded-lg border border-line bg-canvas-elevated p-3">
                    <Switch
                      checked={enabled()}
                      onChange={setEnabled}
                      label="Connection enabled"
                      description="Disabling blocks new sign-ins immediately."
                    />
                  </div>
                  <div class="rounded-lg border border-line bg-canvas-elevated p-3">
                    <p class="text-[12px] font-medium text-ink">Redirect URI</p>
                    <div class="mt-1 flex items-center justify-between gap-2">
                      <code class="truncate font-mono text-[11px] text-ink-muted">{redirectUri()}</code>
                      <CopyButton value={redirectUri()} label="Copy" />
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Role mapping"
                description="Read roles from a group claim. The highest mapped role wins and replaces the stored role on each sign-in; unmapped users become members."
                actions={
                  <Button
                    size="sm"
                    onClick={() =>
                      setGroups((current) => [
                        ...current,
                        { key: crypto.randomUUID(), group: "", role: "member" },
                      ])
                    }
                  >
                    <Icon name="plus" class="size-3.5" /> Add mapping
                  </Button>
                }
              />
              <CardBody class="space-y-4">
                <Field
                  label="Group claim"
                  for="sso-group-claim"
                  hint="For example groups, roles, or memberOf. Leave blank to make everyone a member."
                >
                  <TextInput
                    id="sso-group-claim"
                    value={groupClaim()}
                    placeholder="groups"
                    class="font-mono text-[12px]"
                    onInput={(event) => setGroupClaim(event.currentTarget.value)}
                  />
                </Field>

                <Show
                  when={groups().length > 0}
                  fallback={
                    <p class="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[12px] text-ink-subtle">
                      No mappings. Users are added as members when they sign in.
                    </p>
                  }
                >
                  <div class="space-y-2">
                    <For each={groups()}>
                      {(row) => (
                        <div class="flex flex-wrap items-center gap-2">
                          <TextInput
                            class="min-w-40 flex-1 font-mono text-[12px]"
                            value={row.group}
                            placeholder="ballm-engineering"
                            aria-label="Group name"
                            onInput={(event) =>
                              setGroups((current) =>
                                current.map((item) =>
                                  item.key === row.key ? { ...item, group: event.currentTarget.value } : item,
                                ),
                              )
                            }
                          />
                          <Icon name="arrow-right" class="size-3.5 shrink-0 text-ink-subtle" />
                          <Select
                            class="w-32"
                            value={row.role}
                            aria-label={`Role for ${row.group || "group"}`}
                            onChange={(event) =>
                              setGroups((current) =>
                                current.map((item) =>
                                  item.key === row.key ? { ...item, role: event.currentTarget.value as Role } : item,
                                ),
                              )
                            }
                            options={[
                              { value: "member", label: "Member" },
                              { value: "admin", label: "Admin" },
                              { value: "owner", label: "Owner" },
                            ]}
                          />
                          <IconButton
                            label="Remove mapping"
                            onClick={() => setGroups((current) => current.filter((item) => item.key !== row.key))}
                          >
                            <Icon name="x" class="size-4" />
                          </IconButton>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Connection details" />
              <CardBody class="py-1">
                <FieldRow label="Issuer" value={issuer() || "Not set"} mono />
                <FieldRow label="Client ID" value={clientId() || "Not set"} mono />
                <FieldRow
                  label="Client secret"
                  value={data()?.hasClientSecret ? "Stored and encrypted" : "Not set"}
                />
                <FieldRow label="Last updated" value={data()?.updatedAt ? new Date(data()!.updatedAt!).toLocaleString() : "Never"} />
              </CardBody>
            </Card>
          </form>
        </Show>
      </Show>
    </div>
  )
}

function IdentitySkeleton() {
  return (
    <div class="space-y-4" aria-hidden="true">
      <Skeleton class="h-64" />
      <Skeleton class="h-52" />
      <Skeleton class="h-48" />
    </div>
  )
}

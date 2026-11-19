import { A, useNavigate } from "@solidjs/router"
import { For, Match, Show, Switch, createResource, createSignal, onMount } from "solid-js"
import { Button } from "../components/button"
import { Field, TextInput } from "../components/field"
import { Icon } from "../components/icon"
import { Logo } from "../components/controls"

type FlowKind = "login" | "registration" | "recovery" | "verification" | "settings"

interface FlowMessage {
  id: number
  text: string
  type: "error" | "info" | "success"
}

interface FlowNode {
  type: string
  group: string
  attributes: {
    name?: string
    type?: string
    value?: unknown
    required?: boolean
    disabled?: boolean
    autocomplete?: string
    placeholder?: string
    src?: string
    href?: string
    id?: string
    text?: { text?: string }
    title?: { text?: string }
    onclick?: string
  }
  messages?: FlowMessage[]
  meta?: { label?: { text?: string } }
}

interface IdentityFlow {
  id: string
  ui: { action: string; method: string; nodes: FlowNode[]; messages?: FlowMessage[] }
  requested_aal?: string
}

/**
 * Kratos is headless: it hands us the fields to render and accepts the form directly. Rendering the
 * nodes generically keeps password, code, recovery, verification and settings flows on one screen
 * without duplicating the identity rules in the browser.
 */
export function AuthFlowPage(props: {
  kind: FlowKind
  title: string
  description: string
  footer?: FlowKind
}) {
  const navigate = useNavigate()
  const flowId = () => {
    const params = new URLSearchParams(window.location.search)
    return params.get("flow") ?? params.get("id") ?? ""
  }
  const [error, setError] = createSignal<string>()

  const [flow] = createResource(flowId, async (id) => {
    if (!id) return undefined
    const response = await fetch(`/self-service/${props.kind}/flows?id=${encodeURIComponent(id)}`, {
      headers: { accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    })
    if (response.status === 401 && props.kind === "settings") {
      navigate("/console/?auth=expired", { replace: true })
      return undefined
    }
    if (!response.ok) {
      setError(response.status === 410 ? "That form expired. Start again from the sign-in page." : "That form is no longer available.")
      return undefined
    }
    return (await response.json()) as IdentityFlow
  })

  onMount(() => {
    document.title = `${props.title} · Ballm Code`
  })

  return (
    <main class="flex min-h-dvh">
      <section class="flex w-full flex-col justify-center px-6 py-10 sm:px-10 lg:w-[46%] lg:px-16">
        <div class="mx-auto w-full max-w-sm">
          <Logo />
          <div class="mt-12">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Ballm Code</p>
            <h1 class="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink text-balance">
              {props.title}
            </h1>
            <p class="mt-2 text-[13px] leading-6 text-ink-muted text-pretty">{props.description}</p>
          </div>

          <Show when={!flowId()}>
            <div class="mt-8 rounded-xl border border-line bg-surface p-4">
              <p class="text-[13px] text-ink-muted">This page needs to be opened from the sign-in flow.</p>
              <A
                href="/auth/password/login"
                class="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-accent px-3.5 text-[13.5px] font-medium text-on-accent"
              >
                Start over
              </A>
            </div>
          </Show>

          <Show when={error()}>
            <div class="mt-8 rounded-xl border border-danger/25 bg-danger-soft p-4 text-[13px] text-danger" role="alert">
              {error()}
            </div>
          </Show>

          <Show when={flow.loading}>
            <div class="mt-8 space-y-3" aria-busy="true" aria-label="Loading form">
              <div class="h-9 animate-pulse rounded-lg bg-surface-hover" />
              <div class="h-9 animate-pulse rounded-lg bg-surface-hover" />
              <div class="h-9 animate-pulse rounded-lg bg-surface-hover" />
            </div>
          </Show>

          <Show when={flow()}>
            {(value) => (
              <form
                action={value().ui.action}
                method={value().ui.method.toUpperCase() === "POST" ? "post" : "get"}
                class="mt-8 space-y-4"
                data-flow-id={value().id}
              >
                <Messages messages={value().ui.messages} />
                <For each={value().ui.nodes}>
                  {(node) => (
                    <Switch>
                      <Match when={node.type === "input" && node.attributes.type === "hidden"}>
                        <input
                          type="hidden"
                          name={node.attributes.name}
                          value={String(node.attributes.value ?? "")}
                        />
                      </Match>
                      <Match when={node.type === "input" && node.attributes.type === "submit"}>
                        <Show when={node.group !== "webauthn" && !node.attributes.onclick}>
                          <Button type="submit" variant="primary" block name={node.attributes.name} value={String(node.attributes.value ?? "")}>
                            {node.meta?.label?.text ?? String(node.attributes.value ?? "Continue")}
                          </Button>
                        </Show>
                      </Match>
                      <Match when={node.type === "input" && node.attributes.type === "checkbox"}>
                        <label class="flex items-start gap-2 text-[13px] text-ink-muted">
                          <input
                            type="checkbox"
                            class="mt-0.5 size-3.5 rounded border-line"
                            name={node.attributes.name}
                            value={String(node.attributes.value ?? "true")}
                            checked={Boolean(node.attributes.value)}
                            disabled={node.attributes.disabled}
                          />
                          <span>{node.meta?.label?.text ?? node.attributes.name}</span>
                        </label>
                      </Match>
                      <Match when={node.type === "input" && node.attributes.type !== "button"}>
                        <Field
                          label={node.meta?.label?.text ?? node.attributes.name ?? "Value"}
                          for={node.attributes.name}
                          required={node.attributes.required}
                          error={node.messages?.find((message) => message.type === "error")?.text}
                        >
                          <TextInput
                            id={node.attributes.name}
                            name={node.attributes.name}
                            type={node.attributes.type ?? "text"}
                            value={typeof node.attributes.value === "string" ? node.attributes.value : ""}
                            required={node.attributes.required}
                            disabled={node.attributes.disabled}
                            autocomplete={node.attributes.autocomplete}
                            placeholder={node.attributes.placeholder}
                          />
                        </Field>
                      </Match>
                      <Match when={node.type === "img"}>
                        <img src={node.attributes.src} alt={node.meta?.label?.text ?? "Identity provider image"} class="mx-auto size-44 rounded-lg bg-white p-2" />
                      </Match>
                      <Match when={node.type === "text"}>
                        <p class="text-[12.5px] leading-6 text-ink-muted">{node.attributes.text?.text}</p>
                      </Match>
                      <Match when={node.type === "a"}>
                        <a href={node.attributes.href} class="text-[12.5px] font-medium text-accent hover:underline">
                          {node.attributes.title?.text ?? node.attributes.id}
                        </a>
                      </Match>
                    </Switch>
                  )}
                </For>
              </form>
            )}
          </Show>

          <Show when={props.footer}>
            {(footer) => <FlowFooter kind={footer()} />}
          </Show>
        </div>
      </section>

      <aside class="relative hidden flex-1 overflow-hidden border-l border-line bg-canvas-elevated lg:block">
        <div class="absolute inset-0 bg-[radial-gradient(120%_120%_at_20%_0%,var(--color-accent-soft),transparent_60%)]" />
        <div class="relative flex h-full flex-col justify-between p-12">
          <div class="flex items-center gap-2 text-[12px] text-ink-subtle">
            <Icon name="shield" class="size-4" />
            <span>Passwords are hashed by the identity service, never stored by the model gateway.</span>
          </div>
          <div class="max-w-md">
            <p class="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink text-balance">
              One account. Your personal workspace, or the team you were invited to.
            </p>
            <p class="mt-3 text-[13.5px] leading-6 text-ink-muted">
              Sign in with email and password, use a passkey, or continue through a workspace's SSO
              provider. Terminal sessions use the same account through device approval.
            </p>
          </div>
        </div>
      </aside>
    </main>
  )
}

function Messages(props: { messages?: FlowMessage[] }) {
  return (
    <Show when={props.messages && props.messages.length > 0}>
      <div class="space-y-2">
        <For each={props.messages}>
          {(message) => (
            <p
              class={
                message.type === "error"
                  ? "rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
                  : "rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-ink-muted"
              }
              role={message.type === "error" ? "alert" : "status"}
            >
              {message.text}
            </p>
          )}
        </For>
      </div>
    </Show>
  )
}

function FlowFooter(props: { kind: FlowKind }) {
  return (
    <div class="mt-6 space-y-2 text-[12.5px] text-ink-muted">
      <Show when={props.kind === "login"}>
        <p>
          <a href="/auth/password/recover" class="font-medium text-accent hover:underline">
            Forgot your password?
          </a>
        </p>
        <p>
          New to Ballm Code?{" "}
          <a href="/auth/password/register" class="font-medium text-accent hover:underline">
            Create an account
          </a>
        </p>
        <p>
          Joining a company workspace?{" "}
          <A href="/" class="font-medium text-accent hover:underline">
            Continue with SSO
          </A>
        </p>
      </Show>
      <Show when={props.kind === "registration"}>
        <p>
          Already have an account?{" "}
          <a href="/auth/password/login" class="font-medium text-accent hover:underline">
            Sign in
          </a>
        </p>
      </Show>
      <Show when={props.kind === "recovery"}>
        <p>
          Remembered it?{" "}
          <a href="/auth/password/login" class="font-medium text-accent hover:underline">
            Back to sign in
          </a>
        </p>
      </Show>
      <Show when={props.kind === "verification"}>
        <p>
          Wrong address?{" "}
          <a href="/auth/password/logout" class="font-medium text-accent hover:underline">
            Sign out
          </a>
        </p>
      </Show>
    </div>
  )
}

import { A } from "@solidjs/router"
import { Show, createResource, createSignal, onMount } from "solid-js"
import { api, describeError } from "../api"
import { Button } from "../components/button"
import { Field, TextInput } from "../components/field"
import { Icon } from "../components/icon"
import { Logo } from "../components/controls"

interface AuthConfig {
  password: { enabled: boolean }
  signup: boolean
  sso: boolean
}

export function SignIn() {
  const [email, setEmail] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(
    new URLSearchParams(window.location.search).get("auth") === "expired"
      ? "That sign-in link expired. Try again."
      : "",
  )

  const [config] = createResource(async () => {
    const response = await fetch("/auth/config", { headers: { accept: "application/json" }, cache: "no-store" })
    if (!response.ok) return { password: { enabled: false }, signup: false, sso: true } satisfies AuthConfig
    return (await response.json()) as AuthConfig
  })

  onMount(() => {
    document.title = "Sign in · Ballm Code"
  })

  const submitSso = async (event: SubmitEvent) => {
    event.preventDefault()
    if (!email().includes("@")) {
      setError("Enter your work email address")
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      const result = await api<{ redirectUrl: string }>("/api/console/sign-in", {
        body: { email: email().trim().toLowerCase() },
      })
      window.location.assign(result.redirectUrl)
    } catch (cause) {
      setError(describeError(cause))
      setLoading(false)
    }
  }

  return (
    <main class="flex min-h-dvh">
      <section class="flex w-full flex-col justify-center px-6 py-10 sm:px-10 lg:w-[46%] lg:px-16">
        <div class="mx-auto w-full max-w-sm">
          <Logo />
          <div class="mt-12">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Platform console</p>
            <h1 class="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink text-balance">
              Sign in to your workspace
            </h1>
            <p class="mt-2 text-[13px] leading-6 text-ink-muted text-pretty">
              Use your Ballm Code account, or continue through your organization's identity provider.
            </p>
          </div>

          <Show when={config()?.password.enabled}>
            <div class="mt-8 space-y-3">
              <a
                href="/auth/password/login"
                class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent transition hover:bg-accent-strong"
              >
                <Icon name="mail" class="size-4" />
                Continue with email
              </a>
              <p class="text-center text-[12px] text-ink-subtle">
                Email and password, or a passkey on this device.
              </p>
            </div>

            <div class="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
              <span class="h-px flex-1 bg-line" />
              or use SSO
              <span class="h-px flex-1 bg-line" />
            </div>
          </Show>

          <form class="space-y-4" onSubmit={submitSso}>
            <Field label="Work email" for="email" error={error() || undefined}>
              <div class="relative">
                <Icon
                  name="mail"
                  class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
                />
                <TextInput
                  id="email"
                  type="email"
                  name="email"
                  autocomplete="email"
                  inputmode="email"
                  placeholder="you@company.com"
                  class="pl-9"
                  value={email()}
                  invalid={Boolean(error())}
                  onInput={(event) => setEmail(event.currentTarget.value)}
                  required
                />
              </div>
            </Field>
            <Button type="submit" variant={config()?.password.enabled ? "secondary" : "primary"} block loading={loading()}>
              Continue with SSO
            </Button>
          </form>

          <div class="mt-6 space-y-2 text-[12.5px] text-ink-muted">
            <Show when={config()?.signup}>
              <p>
                Need an account?{" "}
                <a href="/auth/password/register" class="font-medium text-accent hover:underline">
                  Create a workspace
                </a>
              </p>
            </Show>
            <Show when={config()?.password.enabled}>
              <p>
                <a href="/auth/password/recover" class="font-medium text-accent hover:underline">
                  Forgot your password?
                </a>
              </p>
            </Show>
            <p>
              Approving a terminal?{" "}
              <A href="/device" class="font-medium text-accent hover:underline">
                Use the device page
              </A>
            </p>
          </div>
        </div>
      </section>

      <aside class="relative hidden flex-1 overflow-hidden border-l border-line bg-canvas-elevated lg:block">
        <div class="absolute inset-0 bg-[radial-gradient(120%_120%_at_20%_0%,var(--color-accent-soft),transparent_60%)]" />
        <div class="relative flex h-full flex-col justify-between p-12">
          <div class="flex items-center gap-2 text-[12px] text-ink-subtle">
            <Icon name="shield" class="size-4" />
            <span>Organization SSO, personal accounts, and terminal approval share one session model.</span>
          </div>
          <div class="max-w-md">
            <p class="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink text-balance">
              Your workspace, your rules. Models and policy stay under your control.
            </p>
            <p class="mt-3 text-[13.5px] leading-6 text-ink-muted">
              Every request is authenticated, attributed, and bound to the workspace you selected. SSO
              can be enforced per workspace when your company requires it.
            </p>
          </div>
        </div>
      </aside>
    </main>
  )
}

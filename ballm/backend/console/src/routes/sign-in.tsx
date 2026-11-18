import { createSignal, onMount } from "solid-js"
import { api, describeError } from "../api"
import { Button } from "../components/button"
import { Field, TextInput } from "../components/field"
import { Icon } from "../components/icon"
import { Logo } from "../components/controls"

export function SignIn() {
  const [email, setEmail] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string>()

  onMount(() => {
    document.title = "Sign in · Ballm Code"
  })

  const submit = async (event: SubmitEvent) => {
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
              Ballm Code uses your organization's identity provider. Enter your work email and
              we will take you to the right SSO connection.
            </p>
          </div>

          <form class="mt-8 space-y-4" onSubmit={submit}>
            <Field label="Work email" for="email" error={error()}>
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
                  placeholder="you@ballm.internal"
                  class="pl-9"
                  value={email()}
                  invalid={Boolean(error())}
                  onInput={(event) => setEmail(event.currentTarget.value)}
                  required
                  autofocus
                />
              </div>
            </Field>
            <Button type="submit" variant="primary" size="lg" block loading={loading()}>
              Continue with SSO
              <Icon name="arrow-right" class="size-4" />
            </Button>
          </form>

          <div class="mt-8 rounded-xl border border-line bg-surface/60 p-4">
            <div class="flex items-start gap-3">
              <span class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                <Icon name="terminal" class="size-3.5" />
              </span>
              <div>
                <p class="text-[12.5px] font-medium text-ink">Approving a device?</p>
                <p class="mt-0.5 text-[12px] leading-5 text-ink-muted">
                  The code from your terminal can be approved without opening the full console.
                </p>
                <a
                  href="/console/device"
                  class="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
                >
                  Open device approval <Icon name="chevron-right" class="size-3" />
                </a>
              </div>
            </div>
          </div>

          <p class="mt-10 flex items-center gap-1.5 text-[11.5px] text-ink-subtle">
            <Icon name="lock" class="size-3.5" />
            SSO with PKCE. Secrets never leave the server.
          </p>
        </div>
      </section>

      <aside class="relative hidden flex-1 overflow-hidden border-l border-line bg-canvas-elevated lg:block">
        <div class="grid-pattern absolute inset-0" />
        <div class="absolute inset-0 bg-[radial-gradient(700px_420px_at_70%_20%,color-mix(in_oklab,var(--c-accent)_16%,transparent),transparent_70%)]" />
        <div class="relative flex h-full flex-col justify-between p-12">
          <div class="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
            <span class="size-1.5 rounded-full bg-success" />
            Control plane online
          </div>

          <div class="max-w-lg">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Ballm Code</p>
            <h2 class="mt-3 text-[34px] font-semibold leading-[1.15] tracking-[-0.035em] text-ink text-balance">
              One console for access, models, and policy.
            </h2>
            <p class="mt-4 max-w-md text-[13.5px] leading-6 text-ink-muted text-pretty">
              Decide who can use Ballm Code, which models their organization can reach, and what
              their clients are allowed to run — from one place.
            </p>

            <ul class="mt-8 grid gap-3">
              <Feature icon="shield" title="SSO-only entry" text="No local accounts. Every session is issued through your identity provider." />
              <Feature icon="chip" title="Per-organization models" text="The gateway refuses any model that is not on the organization's allowlist." />
              <Feature icon="activity" title="Usage and audit" text="Requests, tokens, and administrative changes are recorded and exportable from Postgres." />
            </ul>
          </div>

          <div class="flex items-center gap-4 text-[11.5px] text-ink-subtle">
            <span>Encrypted secrets at rest</span>
            <span class="size-1 rounded-full bg-ink-subtle/40" />
            <span>Short-lived access tokens</span>
            <span class="size-1 rounded-full bg-ink-subtle/40" />
            <span>Instant revocation</span>
          </div>
        </div>
      </aside>
    </main>
  )
}

function Feature(props: { icon: "shield" | "chip" | "activity"; title: string; text: string }) {
  return (
    <li class="flex items-start gap-3 rounded-xl border border-line/80 bg-surface/50 p-3.5 backdrop-blur-sm">
      <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-canvas-elevated text-accent">
        <Icon name={props.icon} class="size-4" />
      </span>
      <div>
        <p class="text-[12.5px] font-medium text-ink">{props.title}</p>
        <p class="mt-0.5 text-[12px] leading-5 text-ink-muted">{props.text}</p>
      </div>
    </li>
  )
}

import { Show, createResource, createSignal, onMount } from "solid-js"
import { api, describeError } from "../api"
import { Button } from "../components/button"
import { Field, TextInput } from "../components/field"
import { Icon } from "../components/icon"
import { Logo } from "../components/controls"
import { useSession } from "../session"
import type { DeviceState } from "../types"

export function DeviceApproval(props: { initialCode?: string }) {
  const session = useSession()
  const [code, setCode] = createSignal((props.initialCode ?? "").toUpperCase())
  const [email, setEmail] = createSignal("")
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)

  onMount(() => {
    document.title = "Device approval · Ballm Code"
  })

  const [state, { refetch }] = createResource(async () =>
    api<DeviceState>(`/api/console/device${code() ? `?user_code=${encodeURIComponent(code())}` : ""}`),
  )

  const [config] = createResource(async () => {
    const response = await fetch("/auth/config", { headers: { accept: "application/json" }, cache: "no-store" })
    if (!response.ok) return { password: { enabled: false }, signup: false, sso: true }
    return (await response.json()) as { password: { enabled: boolean }; signup: boolean; sso: boolean }
  })

  const start = async (event: SubmitEvent) => {
    event.preventDefault()
    if (!code()) {
      setError("Enter the code shown in your terminal")
      return
    }
    if (!email().includes("@")) {
      setError("Enter your work email address")
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const result = await api<{ redirectUrl: string }>("/api/console/device/start", {
        body: { userCode: code(), email: email().trim().toLowerCase() },
      })
      window.location.assign(result.redirectUrl)
    } catch (cause) {
      setError(describeError(cause))
      setBusy(false)
    }
  }

  const approve = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await session.request("/api/console/device/approve", { body: { userCode: code() } })
      window.location.assign(`/console/device/success?user_code=${encodeURIComponent(code())}`)
    } catch (cause) {
      setError(describeError(cause))
      await refetch()
      setBusy(false)
    }
  }

  return (
    <AuthFrame>
      <div class="rounded-2xl border border-line bg-surface p-6 shadow-2xl sm:p-8">
        <div class="flex items-center justify-between">
          <span class="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas-elevated px-2.5 py-1 text-[11px] font-medium text-ink-muted">
            <Icon name="terminal" class="size-3.5" />
            Device approval
          </span>
          <span class="flex items-center gap-1.5 text-[11px] text-ink-subtle">
            <span class="size-1.5 rounded-full bg-success" />
            Secure connection
          </span>
        </div>

        <h1 class="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.03em] text-ink">
          Connect Ballm Code
        </h1>
        <p class="mt-2 text-[13px] leading-6 text-ink-muted">
          Confirm the code from your terminal. This approves one device and creates a session tied
          to your organization.
        </p>

        <Show when={state.error}>
          <div class="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft/60 p-3" role="alert">
            <Icon name="alert" class="mt-0.5 size-4 shrink-0 text-danger" />
            <p class="text-[12.5px] leading-5 text-ink">
              {state.error instanceof Error ? state.error.message : "Could not check this device code."}
            </p>
          </div>
        </Show>

        <Show when={error()}>
          <div class="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft/60 p-3" role="alert">
            <Icon name="alert" class="mt-0.5 size-4 shrink-0 text-danger" />
            <p class="text-[12.5px] leading-5 text-ink">{error()}</p>
          </div>
        </Show>

        <Show when={!state.loading} fallback={<DeviceSkeleton />}>
          <Show
            when={state()?.signedIn}
            fallback={
              <form class="mt-6 space-y-4" onSubmit={start}>
                <Field label="Device code" for="code">
                  <TextInput
                    id="code"
                    value={code()}
                    placeholder="ABCD-EFGH"
                    autocomplete="one-time-code"
                    autocapitalize="characters"
                    spellcheck={false}
                    class="font-mono text-[15px] tracking-[0.18em] uppercase"
                    onInput={(event) => setCode(event.currentTarget.value.toUpperCase())}
                  />
                </Field>
                <Field
                  label="Work email"
                  for="device-email"
                  hint="SSO finds your organization by domain. Password accounts work too."
                >
                  <TextInput
                    id="device-email"
                    type="email"
                    value={email()}
                    placeholder="you@ballm.internal"
                    autocomplete="email"
                    onInput={(event) => setEmail(event.currentTarget.value)}
                  />
                </Field>
                <Button type="submit" variant="primary" size="lg" block loading={busy()}>
                  Continue with SSO
                  <Icon name="arrow-right" class="size-4" />
                </Button>

                <Show when={config()?.password.enabled}>
                  <div class="flex items-center gap-3 pt-1 text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                    <span class="h-px flex-1 bg-line" />
                    or
                    <span class="h-px flex-1 bg-line" />
                  </div>
                  <a
                    href={`/auth/password/login?user_code=${encodeURIComponent(code())}`}
                    onClick={(event) => {
                      if (!code()) {
                        event.preventDefault()
                        setError("Enter the code shown in your terminal first")
                      }
                    }}
                    class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink transition hover:bg-surface-hover"
                  >
                    <Icon name="mail" class="size-4" />
                    Continue with email and password
                  </a>
                  <Show when={config()?.signup}>
                    <a
                      href={`/auth/password/register?user_code=${encodeURIComponent(code())}`}
                      onClick={(event) => {
                        if (!code()) {
                          event.preventDefault()
                          setError("Enter the code shown in your terminal first")
                        }
                      }}
                      class="block text-center text-[12px] font-medium text-accent hover:underline"
                    >
                      Create an account for this device
                    </a>
                  </Show>
                </Show>
              </form>
            }
          >
            <div class="mt-6 space-y-5">
              <div class="rounded-xl border border-line bg-canvas-elevated p-4">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-full bg-accent-soft text-accent">
                    <Icon name="check" class="size-4" />
                  </span>
                  <div class="min-w-0">
                    <p class="truncate text-[13px] font-medium text-ink">
                      Signed in as {state()?.user?.email}
                    </p>
                    <p class="text-[12px] text-ink-muted">{state()?.org?.name}</p>
                  </div>
                </div>
              </div>

              <Field label="Device code" for="device-code-signed">
                <TextInput
                  id="device-code-signed"
                  value={code()}
                  class="font-mono text-[15px] tracking-[0.18em] uppercase"
                  onInput={(event) => setCode(event.currentTarget.value.toUpperCase())}
                />
              </Field>

              <Show
                when={state()?.codeStatus === "pending"}
                fallback={
                  <div class="flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning-soft/60 p-3">
                    <Icon name="clock" class="mt-0.5 size-4 shrink-0 text-warning" />
                    <p class="text-[12.5px] leading-5 text-ink">
                      That code is unknown, expired, or already used. Check the terminal and enter
                      the current code.
                    </p>
                  </div>
                }
              >
                <Button
                  variant="primary"
                  size="lg"
                  block
                  loading={busy()}
                  disabled={session.status() !== "ready"}
                  onClick={approve}
                >
                  <Icon name="shield" class="size-4" />
                  Approve this device
                </Button>
              </Show>

              <div class="flex items-center justify-between border-t border-line pt-4 text-[12px]">
                <span class="text-ink-subtle">Not you?</span>
                <button
                  type="button"
                  class="font-medium text-accent hover:underline"
                  onClick={() => void session.signOut()}
                >
                  Sign out
                </button>
              </div>
            </div>
          </Show>
        </Show>
      </div>

      <p class="mt-5 text-center text-[11.5px] text-ink-subtle">
        Ballm Code never asks for your password. Authentication happens at your identity provider.
      </p>
    </AuthFrame>
  )
}

export function DeviceSuccess(props: { code?: string }) {
  onMount(() => {
    document.title = "Device approved · Ballm Code"
  })

  return (
    <AuthFrame>
      <div class="rounded-2xl border border-line bg-surface p-8 text-center shadow-2xl">
        <span class="mx-auto grid size-14 place-items-center rounded-full border border-success/30 bg-success-soft text-success">
          <Icon name="check" class="size-7" />
        </span>
        <h1 class="mt-5 text-[24px] font-semibold tracking-[-0.03em] text-ink">Device approved</h1>
        <p class="mt-2 text-[13px] leading-6 text-ink-muted">
          <Show when={props.code} fallback="You can return to your terminal.">
            Code <span class="font-mono font-medium text-ink">{props.code}</span> is approved. Return
            to your terminal to continue.
          </Show>
        </p>
        <div class="mt-6 flex flex-col gap-2">
          <a
            href="/console/"
            class="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface px-4 text-[13px] font-medium text-ink transition hover:bg-surface-hover"
          >
            Open the console
          </a>
          <a
            href="/console/device"
            class="text-[12px] font-medium text-ink-muted transition hover:text-ink"
          >
            Approve another device
          </a>
        </div>
      </div>
      <p class="mt-5 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-subtle">
        <Icon name="lock" class="size-3.5" />
        The authorization code is single-use.
      </p>
    </AuthFrame>
  )
}

function AuthFrame(props: { children: import("solid-js").JSX.Element }) {
  return (
    <main class="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-12">
      <div class="grid-pattern pointer-events-none absolute inset-0 opacity-60" />
      <div class="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      <div class="relative w-full max-w-md">
        <div class="mb-7 flex justify-center">
          <Logo />
        </div>
        {props.children}
      </div>
    </main>
  )
}

function DeviceSkeleton() {
  return (
    <div class="mt-6 space-y-4" aria-hidden="true">
      <div class="skeleton h-16 rounded-xl" />
      <div class="skeleton h-9 rounded-lg" />
      <div class="skeleton h-10 rounded-lg" />
    </div>
  )
}

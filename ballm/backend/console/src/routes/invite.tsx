import { useNavigate } from "@solidjs/router"
import { Show, createResource, createSignal, onMount } from "solid-js"
import { api, describeError } from "../api"
import { Button } from "../components/button"
import { Icon } from "../components/icon"
import { Logo } from "../components/controls"
import { useSession } from "../session"
import type { InviteSummary } from "../types"

export function InvitePage() {
  const navigate = useNavigate()
  const session = useSession()
  const token = new URLSearchParams(window.location.search).get("token") ?? ""
  const [error, setError] = createSignal<string>()
  const [accepting, setAccepting] = createSignal(false)

  const [invite] = createResource(async () => {
    if (!token) return undefined
    const response = await fetch(`/auth/invite?token=${encodeURIComponent(token)}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    })
    if (!response.ok) return undefined
    return (await response.json()) as InviteSummary
  })

  onMount(() => {
    document.title = "Join a workspace · Ballm Code"
  })

  const accept = async () => {
    setAccepting(true)
    setError(undefined)
    try {
      const result = await api<{ orgId: string; orgSlug: string }>("/auth/invite/accept", {
        body: { token },
      })
      await session.switchOrg(result.orgId)
      navigate("/", { replace: true })
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setAccepting(false)
    }
  }

  return (
    <main class="grid min-h-dvh place-items-center px-6 py-10">
      <div class="w-full max-w-md">
        <Logo />
        <div class="mt-10 rounded-2xl border border-line bg-surface p-6 shadow-card">
          <Show
            when={invite()}
            fallback={
              <div>
                <span class="grid size-10 place-items-center rounded-xl bg-danger-soft text-danger">
                  <Icon name="alert" class="size-5" />
                </span>
                <h1 class="mt-4 text-[18px] font-semibold text-ink">This invitation is not available</h1>
                <p class="mt-1 text-[13px] leading-6 text-ink-muted">
                  It may have expired, been revoked, or already been accepted. Ask an owner of the
                  workspace to send a new one.
                </p>
                <a
                  href="/console/"
                  class="mt-5 inline-flex h-9 items-center justify-center rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink hover:bg-surface-hover"
                >
                  Go to the console
                </a>
              </div>
            }
          >
            {(value) => (
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Invitation</p>
                <h1 class="mt-2 text-[20px] font-semibold leading-tight text-ink">
                  Join {value().orgName}
                </h1>
                <p class="mt-2 text-[13px] leading-6 text-ink-muted">
                  This invitation is for <span class="font-medium text-ink">{value().email}</span> as{" "}
                  <span class="font-medium capitalize text-ink">{value().role}</span>.
                </p>

                <Show when={error()}>
                  <p class="mt-4 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[12.5px] text-danger" role="alert">
                    {error()}
                  </p>
                </Show>

                <Show
                  when={session.status() === "ready"}
                  fallback={
                    <div class="mt-6 space-y-2">
                      <a
                        href={`/auth/password/register?invite=${encodeURIComponent(token)}`}
                        class="inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-strong"
                      >
                        Create an account
                      </a>
                      <a
                        href={`/auth/password/login?invite=${encodeURIComponent(token)}`}
                        class="inline-flex h-10 w-full items-center justify-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-hover"
                      >
                        I already have an account
                      </a>
                      <p class="pt-1 text-[12px] text-ink-subtle">
                        Use {value().email} so the invitation matches your account.
                      </p>
                    </div>
                  }
                >
                  <Button class="mt-6" variant="primary" block loading={accepting()} onClick={() => void accept()}>
                    Join {value().orgName}
                  </Button>
                  <p class="mt-2 text-[12px] text-ink-subtle">
                    Signed in as {session.user()?.email}. The invitation only matches{" "}
                    {value().email}.
                  </p>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </div>
    </main>
  )
}

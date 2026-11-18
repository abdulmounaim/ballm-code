import { For, Show, createContext, createSignal, onCleanup, useContext, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { cx } from "../lib/cx"
import { Icon, type IconName } from "./icon"

type Tone = "success" | "error" | "info"

interface Toast {
  id: string
  tone: Tone
  title: string
  description?: string
}

interface ToastApi {
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastApi>()

const icons: Record<Tone, IconName> = {
  success: "check",
  error: "alert",
  info: "info",
}

const tones: Record<Tone, string> = {
  success: "border-success/30 text-success",
  error: "border-danger/30 text-danger",
  info: "border-info/30 text-info",
}

export function ToastProvider(props: { children: JSX.Element }) {
  const [toasts, setToasts] = createSignal<Toast[]>([])
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const dismiss = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
  }

  const push = (tone: Tone, title: string, description?: string) => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current.slice(-3), { id, tone, title, description }])
    timers.set(
      id,
      setTimeout(() => dismiss(id), tone === "error" ? 8_000 : 5_000),
    )
  }

  onCleanup(() => {
    for (const timer of timers.values()) clearTimeout(timer)
  })

  const api: ToastApi = {
    success: (title, description) => push("success", title, description),
    error: (title, description) => push("error", title, description),
    info: (title, description) => push("info", title, description),
    dismiss,
  }

  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <Portal>
        <div
          class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
          aria-live="polite"
          aria-atomic="false"
        >
          <For each={toasts()}>
            {(toast) => (
              <div
                class="pointer-events-auto flex w-full max-w-sm animate-slide items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-2xl"
                role={toast.tone === "error" ? "alert" : "status"}
              >
                <span
                  class={cx(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
                    tones[toast.tone],
                  )}
                >
                  <Icon name={icons[toast.tone]} class="size-3.5" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-[13px] font-medium text-ink">{toast.title}</p>
                  <Show when={toast.description}>
                    <p class="mt-0.5 text-[12px] leading-5 text-ink-muted">{toast.description}</p>
                  </Show>
                </div>
                <button
                  type="button"
                  class="rounded-md p-1 text-ink-subtle transition hover:bg-surface-hover hover:text-ink"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                >
                  <Icon name="x" class="size-3.5" />
                </button>
              </div>
            )}
          </For>
        </div>
      </Portal>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error("useToast must be used inside ToastProvider")
  return context
}

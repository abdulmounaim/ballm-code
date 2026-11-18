import { Show, type JSX } from "solid-js"
import { cx } from "../lib/cx"
import { initials } from "../lib/format"

export function Avatar(props: { name?: string | null; email: string; size?: "sm" | "md" | "lg"; class?: string }) {
  const hue = () => {
    let value = 0
    for (const character of props.email) value = (value * 31 + character.charCodeAt(0)) % 360
    return value
  }
  const sizes = { sm: "size-7 text-[10px]", md: "size-9 text-[11px]", lg: "size-12 text-sm" }
  return (
    <span
      class={cx(
        "inline-grid shrink-0 place-items-center rounded-full border border-line font-semibold tracking-wide",
        sizes[props.size ?? "md"],
        props.class,
      )}
      style={{
        background: `color-mix(in oklab, hsl(${hue()} 72% 55%) 16%, var(--c-surface))`,
        color: `light-dark(hsl(${hue()} 55% 40%), hsl(${hue()} 70% 72%))`,
      }}
      aria-hidden="true"
    >
      {initials(props.name, props.email)}
    </span>
  )
}

export function PageHeader(props: {
  eyebrow?: string
  title: string
  description?: string
  actions?: JSX.Element
}) {
  return (
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <Show when={props.eyebrow}>
          <p class="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{props.eyebrow}</p>
        </Show>
        <h1 class="text-[22px] font-semibold tracking-[-0.02em] text-ink sm:text-[24px]">{props.title}</h1>
        <Show when={props.description}>
          <p class="mt-1 max-w-2xl text-[13px] leading-6 text-ink-muted text-pretty">{props.description}</p>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="flex shrink-0 flex-wrap items-center gap-2">{props.actions}</div>
      </Show>
    </div>
  )
}

export function Empty(props: {
  icon?: JSX.Element
  title: string
  description?: string
  action?: JSX.Element
  class?: string
}) {
  return (
    <div class={cx("flex flex-col items-center justify-center px-6 py-14 text-center", props.class)}>
      <Show when={props.icon}>
        <div class="mb-3 grid size-11 place-items-center rounded-xl border border-line bg-surface-strong text-ink-muted">
          {props.icon}
        </div>
      </Show>
      <p class="text-[13.5px] font-medium text-ink">{props.title}</p>
      <Show when={props.description}>
        <p class="mt-1 max-w-sm text-[12.5px] leading-5 text-ink-muted">{props.description}</p>
      </Show>
      <Show when={props.action}>
        <div class="mt-4">{props.action}</div>
      </Show>
    </div>
  )
}

export function Skeleton(props: { class?: string }) {
  return <div class={cx("skeleton rounded-lg", props.class)} aria-hidden="true" />
}

export function InlineError(props: { title: string; description?: string; onRetry?: () => void }) {
  return (
    <div class="rounded-xl border border-danger/25 bg-danger-soft/50 p-4">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 grid size-6 place-items-center rounded-full bg-danger/15 text-danger">
          <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 8v5M12 16h.01" stroke-linecap="round" />
          </svg>
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-medium text-ink">{props.title}</p>
          <Show when={props.description}>
            <p class="mt-0.5 text-[12px] leading-5 text-ink-muted">{props.description}</p>
          </Show>
        </div>
        <Show when={props.onRetry}>
          <button
            type="button"
            class="rounded-md px-2 py-1 text-[12px] font-medium text-danger transition hover:bg-danger/10"
            onClick={props.onRetry}
          >
            Retry
          </button>
        </Show>
      </div>
    </div>
  )
}

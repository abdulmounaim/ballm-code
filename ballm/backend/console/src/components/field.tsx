import { Show, splitProps, type JSX } from "solid-js"
import { cx } from "../lib/cx"
import { Icon } from "./icon"
import { createSignal } from "solid-js"

export function Field(props: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  for?: string
  children: JSX.Element
  class?: string
  trailing?: JSX.Element
}) {
  return (
    <div class={cx("space-y-1.5", props.class)}>
      <div class="flex items-baseline justify-between gap-3">
        <label for={props.for} class="text-[12.5px] font-medium text-ink">
          {props.label}
          <Show when={props.required}>
            <span class="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          </Show>
        </label>
        {props.trailing}
      </div>
      {props.children}
      <Show when={props.error} fallback={<Show when={props.hint}><p class="text-[12px] leading-5 text-ink-subtle">{props.hint}</p></Show>}>
        <p class="text-[12px] leading-5 text-danger" role="alert">
          {props.error}
        </p>
      </Show>
    </div>
  )
}

const inputBase =
  "w-full rounded-lg border bg-canvas-elevated px-3 text-[13.5px] text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.02)] transition-[border-color,box-shadow] duration-150 placeholder:text-ink-subtle focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"

export function TextInput(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean },
) {
  const [local, rest] = splitProps(props, ["class", "invalid"])
  return (
    <input
      {...rest}
      aria-invalid={local.invalid ? "true" : undefined}
      class={cx(
        inputBase,
        "h-9",
        local.invalid
          ? "border-danger/50 focus:border-danger focus:ring-danger/20"
          : "border-line focus:border-accent focus:ring-accent/20",
        local.class,
      )}
    />
  )
}

export function Textarea(
  props: JSX.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean },
) {
  const [local, rest] = splitProps(props, ["class", "invalid"])
  return (
    <textarea
      {...rest}
      aria-invalid={local.invalid ? "true" : undefined}
      class={cx(
        inputBase,
        "min-h-24 py-2 leading-6",
        local.invalid
          ? "border-danger/50 focus:border-danger focus:ring-danger/20"
          : "border-line focus:border-accent focus:ring-accent/20",
        local.class,
      )}
    />
  )
}

export function Select(
  props: JSX.SelectHTMLAttributes<HTMLSelectElement> & {
    options: Array<{ value: string; label: string; disabled?: boolean }>
  },
) {
  const [local, rest] = splitProps(props, ["class", "options", "children"])
  return (
    <div class="relative">
      <select
        {...rest}
        class={cx(
          inputBase,
          "h-9 appearance-none border-line pr-8 focus:border-accent focus:ring-accent/20",
          local.class,
        )}
      >
        {local.children}
        {local.options.map((option) => (
          <option value={option.value} selected={option.value === rest.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        class="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle"
      />
    </div>
  )
}

export function SecretInput(props: JSX.InputHTMLAttributes<HTMLInputElement> & { hasStored?: boolean }) {
  const [local, rest] = splitProps(props, ["class", "hasStored"])
  const [visible, setVisible] = createSignal(false)
  return (
    <div class="relative">
      <input
        {...rest}
        type={visible() ? "text" : "password"}
        class={cx(inputBase, "h-9 border-line pr-12 focus:border-accent focus:ring-accent/20", local.class)}
      />
      <button
        type="button"
        class="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-subtle transition hover:bg-surface-hover hover:text-ink"
        aria-label={visible() ? "Hide value" : "Show value"}
        title={visible() ? "Hide value" : "Show value"}
        onClick={() => setVisible((current) => !current)}
      >
        <Icon name={visible() ? "eye-off" : "eye"} class="size-3.5" />
      </button>
    </div>
  )
}

export function Switch(props: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  hideLabel?: boolean
}) {
  return (
    <div class="flex items-center justify-between gap-4">
      <div class={props.hideLabel ? "sr-only" : "min-w-0"}>
        <p class="text-[13px] font-medium text-ink">{props.label}</p>
        <Show when={props.description}>
          <p class="text-[12px] text-ink-muted">{props.description}</p>
        </Show>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
        class={cx(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-50",
          props.checked ? "border-accent bg-accent" : "border-line-strong bg-surface-strong",
        )}
      >
        <span
          class={cx(
            "block size-4 rounded-full bg-white shadow-sm transition-transform duration-200",
            props.checked ? "translate-x-[19px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </div>
  )
}

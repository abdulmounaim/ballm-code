import { For, Show, createSignal, createUniqueId, type JSX } from "solid-js"
import { cx } from "../lib/cx"
import { Icon } from "./icon"

export function Logo(props: { class?: string; showWordmark?: boolean }) {
  const gradient = createUniqueId()
  return (
    <span class={cx("inline-flex items-center gap-2.5", props.class)}>
      <svg viewBox="0 0 64 64" fill="none" class="size-8 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="8" y1="6" x2="56" y2="60" gradientUnits="userSpaceOnUse">
            <stop stop-color="var(--c-accent)" />
            <stop offset="1" stop-color="var(--c-accent-strong)" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${gradient})`} />
        <rect x="12" y="12" width="40" height="40" rx="10" stroke="var(--c-on-accent)" stroke-opacity="0.35" stroke-width="2" />
        <path d="M23 20h9.5a6.5 6.5 0 0 1 0 13H23V20Z" fill="var(--c-on-accent)" />
        <path d="M23 31h11a6.5 6.5 0 0 1 0 13H23V31Z" fill="var(--c-on-accent)" />
      </svg>
      <Show when={props.showWordmark !== false}>
        <span class="text-[15px] font-semibold tracking-[-0.02em] text-ink">Ballm Code</span>
      </Show>
    </span>
  )
}

export function CopyButton(props: { value: string; label?: string; class?: string }) {
  const [copied, setCopied] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.value)
    } catch {
      const input = document.createElement("textarea")
      input.value = props.value
      input.style.position = "fixed"
      input.style.opacity = "0"
      document.body.append(input)
      input.select()
      document.execCommand("copy")
      input.remove()
    }
    setCopied(true)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => setCopied(false), 1_600)
  }

  return (
    <button
      type="button"
      onClick={copy}
      class={cx(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-ink-muted transition hover:bg-surface-hover hover:text-ink",
        props.class,
      )}
      aria-label={copied() ? "Copied" : (props.label ?? "Copy")}
    >
      <Icon name={copied() ? "check" : "copy"} class="size-3.5" />
      <span>{copied() ? "Copied" : (props.label ?? "Copy")}</span>
    </button>
  )
}

export function Segmented<T extends string>(props: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
  label?: string
}) {
  return (
    <div
      class="inline-flex rounded-lg border border-line bg-canvas-elevated p-0.5"
      role="radiogroup"
      aria-label={props.label}
    >
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === option.value}
            onClick={() => props.onChange(option.value)}
            class={cx(
              "rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition",
              props.value === option.value
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  )
}

export function TagInput(props: {
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  id?: string
}) {
  const [draft, setDraft] = createSignal("")

  const commit = (raw: string) => {
    const values = raw
      .split(/[\s,]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
    if (values.length === 0) return
    props.onChange(Array.from(new Set([...props.values, ...values])))
    setDraft("")
  }

  return (
    <div class="min-h-9 rounded-lg border border-line bg-canvas-elevated p-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      <div class="flex flex-wrap gap-1.5">
        <For each={props.values}>
          {(value) => (
            <span class="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink">
              {value}
              <button
                type="button"
                class="rounded-sm p-0.5 text-ink-subtle transition hover:text-danger"
                onClick={() => props.onChange(props.values.filter((item) => item !== value))}
                aria-label={`Remove ${value}`}
              >
                <Icon name="x" class="size-3" />
              </button>
            </span>
          )}
        </For>
        <input
          id={props.id}
          value={draft()}
          placeholder={props.values.length === 0 ? props.placeholder : "Add domain"}
          class="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-[13px] text-ink outline-none placeholder:text-ink-subtle"
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "," || event.key === " ") {
              event.preventDefault()
              commit(draft())
            }
            if (event.key === "Backspace" && draft() === "" && props.values.length > 0) {
              props.onChange(props.values.slice(0, -1))
            }
          }}
          onBlur={() => commit(draft())}
        />
      </div>
    </div>
  )
}

export function FieldRow(props: { label: string; value: JSX.Element; mono?: boolean }) {
  return (
    <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2.5 last:border-0">
      <p class="text-[12px] text-ink-muted">{props.label}</p>
      <div class={cx("text-[12.5px] text-ink", props.mono && "font-mono text-[11.5px]")}>{props.value}</div>
    </div>
  )
}

import { Show, splitProps, type JSX } from "solid-js"
import { cx } from "../lib/cx"

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid" | "soft"
type Size = "sm" | "md" | "lg" | "icon"

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent hover:bg-accent-strong border border-transparent shadow-[inset_0_1px_0_rgb(255_255_255/0.14)]",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-hover hover:border-line-strong",
  ghost: "bg-transparent text-ink-muted hover:text-ink hover:bg-surface-hover border border-transparent",
  danger: "bg-danger-soft text-danger border border-danger/25 hover:bg-danger/15",
  "danger-solid": "bg-danger text-white border border-transparent hover:brightness-110",
  soft: "bg-accent-soft text-accent border border-accent/20 hover:bg-accent/15",
}

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-[13.5px] gap-2",
  lg: "h-10 px-4 text-sm gap-2",
  icon: "h-8 w-8 p-0",
}

export function Button(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant
    size?: Size
    loading?: boolean
    block?: boolean
  },
) {
  const [local, rest] = splitProps(props, ["variant", "size", "loading", "block", "class", "children", "disabled"])
  return (
    <button
      {...rest}
      disabled={local.disabled || local.loading}
      class={cx(
        "inline-flex select-none items-center justify-center rounded-lg font-medium transition-[background-color,border-color,color,box-shadow] duration-150",
        "disabled:pointer-events-none disabled:opacity-55",
        variants[local.variant ?? "secondary"],
        sizes[local.size ?? "md"],
        local.block && "w-full",
        local.class,
      )}
    >
      <Show when={local.loading}>
        <span
          class="size-3.5 animate-spin-slow rounded-full border-2 border-current border-r-transparent"
          aria-hidden="true"
        />
      </Show>
      {local.children}
    </button>
  )
}

export function IconButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: Variant },
) {
  const [local, rest] = splitProps(props, ["label", "variant", "class"])
  return (
    <Button
      {...rest}
      size="icon"
      variant={local.variant ?? "ghost"}
      aria-label={local.label}
      title={local.label}
      class={local.class}
    />
  )
}

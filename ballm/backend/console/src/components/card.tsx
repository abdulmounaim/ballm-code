import { splitProps, type JSX } from "solid-js"
import { cx } from "../lib/cx"

export function Card(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div
      {...rest}
      class={cx(
        "rounded-xl2 border border-line bg-surface shadow-card",
        local.class,
      )}
    >
      {local.children}
    </div>
  )
}

export function CardHeader(props: {
  title: string
  description?: string
  actions?: JSX.Element
  class?: string
}) {
  return (
    <div class={cx("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", props.class)}>
      <div class="min-w-0">
        <h2 class="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{props.title}</h2>
        {props.description ? <p class="mt-0.5 text-[12.5px] text-ink-muted">{props.description}</p> : null}
      </div>
      {props.actions ? <div class="flex shrink-0 items-center gap-2">{props.actions}</div> : null}
    </div>
  )
}

export function CardBody(props: { class?: string; children: JSX.Element }) {
  return <div class={cx("px-5 py-4", props.class)}>{props.children}</div>
}

import type { JSX } from "solid-js"
import { cx } from "../lib/cx"

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info"

const tones: Record<Tone, string> = {
  neutral: "bg-surface-strong text-ink-muted border-line",
  accent: "bg-accent-soft text-accent border-accent/25",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  info: "bg-info-soft text-info border-info/25",
}

export function Badge(props: {
  tone?: Tone
  children: JSX.Element
  class?: string
  dot?: boolean
}) {
  return (
    <span
      class={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-4",
        tones[props.tone ?? "neutral"],
        props.class,
      )}
    >
      {props.dot ? <span class="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {props.children}
    </span>
  )
}

const roleTone: Record<string, Tone> = {
  owner: "accent",
  admin: "info",
  member: "neutral",
}

export function RoleBadge(props: { role: string }) {
  return (
    <Badge tone={roleTone[props.role] ?? "neutral"} class="capitalize">
      {props.role}
    </Badge>
  )
}

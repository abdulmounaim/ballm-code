import { For, Show, createMemo, createSignal, createUniqueId } from "solid-js"
import { compactNumber, dayLabel, fullNumber } from "../lib/format"
import type { UsagePoint } from "../types"
import { Icon, type IconName } from "./icon"

export function Stat(props: {
  label: string
  value: string
  hint?: string
  icon?: IconName
  tone?: "default" | "accent" | "danger"
}) {
  return (
    <div class="rounded-xl2 border border-line bg-surface p-4 shadow-card">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-subtle">{props.label}</p>
        <Show when={props.icon}>
          <span
            class={
              props.tone === "danger"
                ? "text-danger"
                : props.tone === "accent"
                  ? "text-accent"
                  : "text-ink-subtle"
            }
          >
            <Icon name={props.icon!} class="size-4" />
          </span>
        </Show>
      </div>
      <p class="mt-2 text-[26px] font-semibold leading-8 tracking-[-0.03em] text-ink tabular">{props.value}</p>
      <Show when={props.hint}>
        <p class="mt-1 text-[11.5px] text-ink-muted">{props.hint}</p>
      </Show>
    </div>
  )
}

export function AreaChart(props: { points: UsagePoint[]; metric: "requests" | "tokens" }) {
  const [hover, setHover] = createSignal<number | null>(null)
  const gradientId = createUniqueId()
  const width = 640
  const height = 180
  const top = 12
  const baseline = height - 10

  const values = createMemo(() =>
    props.points.map((point) => (props.metric === "requests" ? point.requests : point.tokens)),
  )
  const max = createMemo(() => Math.max(1, ...values()))
  const coords = createMemo(() =>
    values().map((value, index) => ({
      x: values().length <= 1 ? width / 2 : (index / (values().length - 1)) * width,
      y: baseline - (value / max()) * (baseline - top),
      value,
      point: props.points[index]!,
    })),
  )

  const line = createMemo(() =>
    coords()
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(" "),
  )
  const area = createMemo(() => {
    const points = coords()
    if (points.length === 0) return ""
    const first = points[0]!
    const last = points.at(-1)!
    return `${line()} L${last.x.toFixed(1)},${baseline} L${first.x.toFixed(1)},${baseline} Z`
  })

  const axis = createMemo(() => {
    const points = props.points
    if (points.length === 0) return []
    const indexes = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
      (value, index, list) => list.indexOf(value) === index,
    )
    return indexes.map((index) => ({ index, label: dayLabel(points[index]!.day) }))
  })

  const active = () => {
    const index = hover()
    return index === null ? undefined : coords()[index]
  }

  function onPointerMove(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || props.points.length === 0) return
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    setHover(Math.round(ratio * (props.points.length - 1)))
  }

  const format = props.metric === "requests" ? fullNumber : compactNumber

  return (
    <figure class="relative">
      <div class="relative" onPointerMove={onPointerMove} onPointerLeave={() => setHover(null)} role="presentation">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          class="h-44 w-full overflow-visible"
          role="img"
          aria-label={`${props.metric} over the last ${props.points.length} days`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--c-accent)" stop-opacity="0.28" />
              <stop offset="100%" stop-color="var(--c-accent)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <For each={[0.25, 0.5, 0.75, 1]}>
            {(ratio) => (
              <line
                x1="0"
                x2={width}
                y1={baseline - (baseline - top) * ratio}
                y2={baseline - (baseline - top) * ratio}
                stroke="var(--c-border)"
                stroke-dasharray="3 6"
                vector-effect="non-scaling-stroke"
              />
            )}
          </For>
          <Show when={coords().length > 0}>
            <path d={area()} fill={`url(#${gradientId})`} />
            <path
              d={line()}
              fill="none"
              stroke="var(--c-accent)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
          </Show>
        </svg>

        <Show when={active()}>
          {(point) => (
            <>
              <div
                class="pointer-events-none absolute top-0 h-full w-px bg-accent/35"
                style={{ left: `${(point().x / width) * 100}%` }}
              />
              <div
                class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow"
                style={{
                  left: `${(point().x / width) * 100}%`,
                  top: `${(point().y / height) * 100}%`,
                }}
              />
              <div
                class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-xl"
                style={{
                  left: `${Math.min(92, Math.max(8, (point().x / width) * 100))}%`,
                  top: `${(point().y / height) * 100}%`,
                }}
              >
                <p class="text-[11px] text-ink-subtle">{dayLabel(point().point.day)}</p>
                <p class="text-[12px] font-semibold text-ink tabular">
                  {format(point().value)}
                  <span class="ml-1 font-normal text-ink-muted">{props.metric}</span>
                </p>
              </div>
            </>
          )}
        </Show>
      </div>

      <div class="mt-2 flex justify-between text-[11px] text-ink-subtle">
        <For each={axis()}>{(item) => <span>{item.label}</span>}</For>
      </div>

      <figcaption class="sr-only">
        {props.points
          .map((point) => `${point.day}: ${point.requests} requests, ${point.tokens} tokens`)
          .join("; ")}
      </figcaption>
    </figure>
  )
}

export function BreakdownBars(props: {
  items: Array<{ key: string; label: string; requests: number }>
  empty?: string
}) {
  const max = () => Math.max(1, ...props.items.map((item) => item.requests))
  return (
    <Show
      when={props.items.length > 0}
      fallback={<p class="py-6 text-center text-[12.5px] text-ink-subtle">{props.empty ?? "No data yet"}</p>}
    >
      <ul class="space-y-3">
        <For each={props.items}>
          {(item) => (
            <li>
              <div class="flex items-baseline justify-between gap-3">
                <span class="truncate text-[12.5px] text-ink">{item.label}</span>
                <span class="shrink-0 text-[11.5px] text-ink-muted tabular">{fullNumber(item.requests)}</span>
              </div>
              <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-strong">
                <div
                  class="h-full rounded-full bg-accent/80 transition-[width] duration-500"
                  style={{ width: `${Math.max(2, (item.requests / max()) * 100)}%` }}
                />
              </div>
            </li>
          )}
        </For>
      </ul>
    </Show>
  )
}

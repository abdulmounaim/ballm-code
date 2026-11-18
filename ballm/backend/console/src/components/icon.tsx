import type { JSX } from "solid-js"

const paths = {
  grid: () => (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
    </>
  ),
  users: () => (
    <>
      <path d="M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20" />
      <circle cx="9.5" cy="8" r="3.4" />
      <path d="M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.6 4.8a3.4 3.4 0 0 1 0 6.4" />
    </>
  ),
  chip: () => (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
      <path d="M9.5 9.5h5v5h-5zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </>
  ),
  shield: () => (
    <>
      <path d="M12 3 4.8 6v5.4c0 4.4 3 8 7.2 9.6 4.2-1.6 7.2-5.2 7.2-9.6V6L12 3Z" />
      <path d="m9.2 12 2 2 3.6-4" />
    </>
  ),
  plug: () => (
    <>
      <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8ZM12 17v4" />
    </>
  ),
  monitor: () => (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  chart: () => (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 15 3.2-4 3.3 2.6L20 6.5" />
    </>
  ),
  list: () => (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.6" cy="6" r=".9" fill="currentColor" stroke="none" />
      <circle cx="3.6" cy="12" r=".9" fill="currentColor" stroke="none" />
      <circle cx="3.6" cy="18" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  search: () => (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: () => <path d="M12 5v14M5 12h14" />,
  more: () => (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  copy: () => (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </>
  ),
  check: () => <path d="m4.5 12.5 5 5L20 6.5" />,
  x: () => <path d="M6 6l12 12M18 6 6 18" />,
  "chevron-down": () => <path d="m6 9 6 6 6-6" />,
  "chevron-right": () => <path d="m9 6 6 6-6 6" />,
  "chevron-left": () => <path d="m15 6-6 6 6 6" />,
  logout: () => (
    <>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </>
  ),
  sun: () => (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: () => <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.4 8.4 0 1 0 10.5 10.5Z" />,
  alert: () => (
    <>
      <path d="M12 3.5 2.8 20h18.4L12 3.5Z" />
      <path d="M12 9v4.5M12 17h.01" />
    </>
  ),
  info: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.6h.01" />
    </>
  ),
  trash: () => (
    <>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="m6 7 1 13h10l1-13M10 11v5M14 11v5" />
    </>
  ),
  edit: () => (
    <>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14 7 3 3" />
    </>
  ),
  refresh: () => (
    <>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 1-2-5" />
    </>
  ),
  menu: () => <path d="M4 7h16M4 12h16M4 17h16" />,
  command: () => (
    <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z" />
  ),
  "arrow-right": () => <path d="M4 12h16M13 5l7 7-7 7" />,
  mail: () => (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.4" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  globe: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.4 3.6 5.4 3.6 9S14.4 18.6 12 21c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3Z" />
    </>
  ),
  clock: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  activity: () => <path d="M2 12h4l3-8 4 16 3-8h6" />,
  key: () => (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8M15 4l3 3M18 7l2-2" />
    </>
  ),
  external: () => (
    <>
      <path d="M14 4h6v6M20 4l-8 8" />
      <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
    </>
  ),
  lock: () => (
    <>
      <rect x="4.5" y="10" width="15" height="10" rx="2.4" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
  terminal: () => (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="2.4" />
      <path d="m7 9 3 3-3 3M12.5 15H17" />
    </>
  ),
  eye: () => (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": () => (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.5 5.8A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.5M6 7.2A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.5-.6" />
      <path d="M10.2 10.3a2.6 2.6 0 0 0 3.6 3.6" />
    </>
  ),
  filter: () => <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
  download: () => (
    <>
      <path d="M12 3v11M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  sparkles: () => (
    <>
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </>
  ),
  dot: () => <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
} satisfies Record<string, () => JSX.Element>

export type IconName = keyof typeof paths

export function Icon(props: { name: IconName; class?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={props.size ?? 16}
      height={props.size ?? 16}
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class={props.class}
    >
      {paths[props.name]()}
    </svg>
  )
}

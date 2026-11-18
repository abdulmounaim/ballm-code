import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="3" width="58" height="58" rx="14" stroke="currentColor" stroke-width="4" />
      <path d="M20 15h13.5a9 9 0 0 1 0 18H20V15Z" fill="currentColor" />
      <path d="M20 31h15.5a9 9 0 0 1 0 18H20V31Z" fill="currentColor" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="14" width="72" height="72" rx="18" stroke="currentColor" stroke-width="4" />
      <path d="M24 30h16a10 10 0 0 1 0 20H24V30Z" fill="currentColor" />
      <path d="M24 48h18a10 10 0 0 1 0 20H24V48Z" fill="currentColor" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <text
        x="0"
        y="101"
        fill="currentColor"
        font-family="Inter, ui-sans-serif, system-ui, sans-serif"
        font-size="112"
        font-weight="700"
        letter-spacing="-4"
      >
        ballm code
      </text>
    </svg>
  )
}

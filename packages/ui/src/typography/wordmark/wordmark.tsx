import { type ComponentProps } from "solid-js"

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible": props.outline,
      }}
    >
      <text
        x="0"
        y="101"
        fill={props.outline ? "none" : "currentColor"}
        stroke={props.outline ? "currentColor" : undefined}
        stroke-width={props.outline ? 1.5 : undefined}
        font-family="Inter, ui-sans-serif, system-ui, sans-serif"
        font-size="112"
        font-weight="700"
        letter-spacing="-4"
        opacity={props.muted === false ? 1 : 0.7}
      >
        ballm code
      </text>
    </svg>
  )
}

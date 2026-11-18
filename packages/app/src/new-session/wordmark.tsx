import { Logo } from "@opencode/ui/logo"
import type { Accessor } from "solid-js"
import type { WordmarkEvent, WordmarkState } from "./wordmark-machine"
import "./wordmark.css"

/** The lodger curled up as the brick breaker ball. Positions are the ball's centre, relative to the new session panel. */
export type LodgerBall = {
  radius: () => number
  at: () => { x: number; y: number }
  place: (
    x: number,
    y: number,
    pose: { look: number; lookAngle: number; stretch: number; angle: number; squint: number; curl: number },
  ) => void
  blink: () => void
  /** Uncurls and hops back to its perch beside the pin board. */
  done: () => void
}

/**
 * Reserves the wordmark's space above the composer. The interactive lodger and brick-breaker game are
 * deliberately not part of the Ballm distribution; the wordmark is static.
 */
export function NewSessionWordmark(props: {
  ref?: (element: HTMLDivElement) => void
  state?: Accessor<WordmarkState>
  onEvent?: (event: WordmarkEvent) => void
  play?: boolean
  sound?: () => boolean
}) {
  return (
    <div
      ref={props.ref}
      data-component="new-session-wordmark"
      aria-hidden="true"
      class="pointer-events-none mx-auto w-full max-w-[720px] text-v2-background-bg-inverse"
    >
      <Logo class="mx-auto block h-auto w-4/5" />
    </div>
  )
}

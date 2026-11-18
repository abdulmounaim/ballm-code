import { CloseButton, Content, Description, Overlay, Portal, Root, Title } from "@kobalte/core/dialog"
import { Show, type JSX } from "solid-js"
import { cx } from "../lib/cx"
import { Button } from "./button"
import { Icon } from "./icon"

export function Modal(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: JSX.Element
  footer?: JSX.Element
  class?: string
  dismissable?: boolean
}) {
  return (
    <Root open={props.open} onOpenChange={props.onOpenChange}>
      <Portal>
        <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <Overlay class="absolute inset-0 animate-fade bg-black/55 backdrop-blur-[3px]" />
          <Content
            class={cx(
              "relative z-10 flex max-h-[92dvh] w-full animate-rise flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:max-w-lg sm:rounded-xl2",
              props.class,
            )}
            onEscapeKeyDown={(event) => {
              if (props.dismissable === false) event.preventDefault()
            }}
            onPointerDownOutside={(event) => {
              if (props.dismissable === false) event.preventDefault()
            }}
          >
            <div class="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div class="min-w-0">
                <Title class="text-[15px] font-semibold tracking-[-0.01em] text-ink">{props.title}</Title>
                <Show when={props.description}>
                  <Description class="mt-1 text-[12.5px] leading-5 text-ink-muted">
                    {props.description}
                  </Description>
                </Show>
              </div>
              <CloseButton
                class="grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-hover hover:text-ink"
                aria-label="Close dialog"
              >
                <Icon name="x" class="size-4" />
              </CloseButton>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">{props.children}</div>
            <Show when={props.footer}>
              <div class="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas-elevated/60 px-5 py-3">
                {props.footer}
              </div>
            </Show>
          </Content>
        </div>
      </Portal>
    </Root>
  )
}

export function ConfirmDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  loading?: boolean
  tone?: "danger" | "primary"
  onConfirm: () => void
  children?: JSX.Element
}) {
  return (
    <Modal
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
      description={props.description}
      dismissable={!props.loading}
      footer={
        <>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)} disabled={props.loading}>
            Cancel
          </Button>
          <Button
            variant={props.tone === "primary" ? "primary" : "danger-solid"}
            loading={props.loading}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </Button>
        </>
      }
    >
      {props.children ?? (
        <div class="flex items-start gap-3 rounded-lg border border-danger/20 bg-danger-soft/60 p-3">
          <Icon name="alert" class="mt-0.5 size-4 shrink-0 text-danger" />
          <p class="text-[12.5px] leading-5 text-ink-muted">
            This action takes effect immediately. Active sessions lose access as soon as the change
            is saved.
          </p>
        </div>
      )}
    </Modal>
  )
}

import { Content, Overlay, Portal, Root, Title } from "@kobalte/core/dialog"
import { useNavigate } from "@solidjs/router"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { useSession } from "../session"
import { cycleTheme } from "../lib/theme"
import { cx } from "../lib/cx"
import { Icon, type IconName } from "./icon"

interface Group {
  label: string
  items: Array<{ href: string; label: string; icon: IconName }>
}

interface Command {
  id: string
  label: string
  group: string
  icon: IconName
  run: () => void
}

export function CommandMenu(props: { open: boolean; onOpenChange: (open: boolean) => void; groups: Group[]; isMember: boolean }) {
  const navigate = useNavigate()
  const session = useSession()
  const [query, setQuery] = createSignal("")
  const [index, setIndex] = createSignal(0)
  let input: HTMLInputElement | undefined

  const commands = createMemo<Command[]>(() => {
    const items: Command[] = [
      {
        id: "account",
        label: "Account settings",
        group: "Go to",
        icon: "key",
        run: () => navigate("/account"),
      },
      {
        id: "device",
        label: "Approve a device",
        group: "Go to",
        icon: "terminal",
        run: () => navigate("/device"),
      },
      {
        id: "theme",
        label: "Change theme",
        group: "Preferences",
        icon: "sun",
        run: cycleTheme,
      },
      {
        id: "signout",
        label: "Sign out",
        group: "Preferences",
        icon: "logout",
        run: () => void session.signOut(),
      },
    ]
    if (!props.isMember)
      items.unshift(
        ...props.groups.flatMap((group) =>
          group.items.map((item) => ({
            id: item.href,
            label: item.label,
            group: "Go to",
            icon: item.icon,
            run: () => navigate(item.href),
          })),
        ),
      )
    return items
  })

  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase()
    if (!needle) return commands()
    return commands().filter((command) => command.label.toLowerCase().includes(needle))
  })

  const grouped = createMemo(() => {
    const groups = new Map<string, Command[]>()
    for (const command of filtered()) {
      const list = groups.get(command.group) ?? []
      list.push(command)
      groups.set(command.group, list)
    }
    return Array.from(groups, ([label, items]) => ({ label, items }))
  })

  const flat = createMemo(() => grouped().flatMap((group) => group.items))

  createEffect(() => {
    if (props.open) {
      setQuery("")
      setIndex(0)
      queueMicrotask(() => input?.focus())
    }
  })

  const close = () => props.onOpenChange(false)

  const choose = (command: Command | undefined) => {
    if (!command) return
    close()
    command.run()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setIndex((current) => Math.min(flat().length - 1, current + 1))
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setIndex((current) => Math.max(0, current - 1))
    }
    if (event.key === "Enter") {
      event.preventDefault()
      choose(flat()[index()])
    }
  }

  return (
    <Root open={props.open} onOpenChange={props.onOpenChange}>
      <Portal>
        <div class="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[10vh]">
          <Overlay class="absolute inset-0 animate-fade bg-black/60 backdrop-blur-sm" />
          <Content class="relative z-10 w-full max-w-xl animate-rise overflow-hidden rounded-xl2 border border-line bg-surface shadow-2xl">
            <Title class="sr-only">Command menu</Title>
            <div class="flex items-center gap-2.5 border-b border-line px-4">
              <Icon name="search" class="size-4 shrink-0 text-ink-subtle" />
              <input
                ref={input}
                value={query()}
                onInput={(event) => {
                  setQuery(event.currentTarget.value)
                  setIndex(0)
                }}
                onKeyDown={onKeyDown}
                placeholder="Search pages and actions"
                class="h-12 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-subtle"
                aria-label="Search commands"
              />
              <kbd class="rounded border border-line bg-canvas-elevated px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle">
                esc
              </kbd>
            </div>

            <div class="max-h-[52vh] overflow-y-auto p-2">
              <Show
                when={flat().length > 0}
                fallback={<p class="px-3 py-8 text-center text-[12.5px] text-ink-subtle">No matching commands.</p>}
              >
                <For each={grouped()}>
                  {(group) => (
                    <div class="mb-1.5">
                      <p class="px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                        {group.label}
                      </p>
                      <For each={group.items}>
                        {(command) => {
                          const active = () => flat().indexOf(command) === index()
                          return (
                            <button
                              type="button"
                              class={cx(
                                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition",
                                active() ? "bg-accent-soft text-accent" : "text-ink hover:bg-surface-hover",
                              )}
                              onPointerEnter={() => setIndex(flat().indexOf(command))}
                              onClick={() => choose(command)}
                            >
                              <Icon name={command.icon} class="size-4" />
                              <span class="flex-1">{command.label}</span>
                              <Show when={active()}>
                                <span class="font-mono text-[10px] text-ink-subtle">↵</span>
                              </Show>
                            </button>
                          )
                        }}
                      </For>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </Content>
        </div>
      </Portal>
    </Root>
  )
}

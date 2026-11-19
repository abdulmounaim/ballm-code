import { A, useLocation, useNavigate } from "@solidjs/router"
import { For, Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { cx } from "../lib/cx"
import { cycleTheme, theme } from "../lib/theme"
import { useSession } from "../session"
import { Avatar } from "./ui"
import { Badge } from "./badge"
import { Button, IconButton } from "./button"
import { Icon, type IconName } from "./icon"
import { Logo } from "./controls"
import { CommandMenu } from "./command-menu"

interface NavItem {
  href: string
  label: string
  icon: IconName
  show: () => boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

export function Shell(props: { children?: JSX.Element }) {
  const session = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = createSignal(false)
  const [commandOpen, setCommandOpen] = createSignal(false)
  const [userOpen, setUserOpen] = createSignal(false)
  const [orgOpen, setOrgOpen] = createSignal(false)

  const path = () => location.pathname.replace(/^\/console/, "") || "/"
  const isMember = () => session.session()?.role === "member"

  createEffect(() => {
    location.pathname
    window.scrollTo(0, 0)
  })

  createEffect(() => {
    document.title = `${sectionLabel()} · Ballm Code`
  })

  const groups = (): NavGroup[] => {
    if (isMember()) return []
    const can = session.can()
    return [
      {
        label: "Workspace",
        items: [
          { href: "/", label: "Overview", icon: "grid", show: () => true },
          { href: "/members", label: "Members", icon: "users", show: () => can.manageMembers },
          { href: "/models", label: "Models", icon: "chip", show: () => can.manageModels },
          { href: "/policies", label: "Policies", icon: "list", show: () => can.managePolicies },
        ],
      },
      {
        label: "Security",
        items: [
          { href: "/identity", label: "Identity", icon: "shield", show: () => can.manageSso },
          { href: "/upstream", label: "Upstream", icon: "plug", show: () => can.manageUpstream },
          { href: "/sessions", label: "Sessions", icon: "monitor", show: () => can.manageMembers },
        ],
      },
      {
        label: "Observability",
        items: [
          { href: "/usage", label: "Usage", icon: "chart", show: () => can.viewUsage },
          { href: "/audit", label: "Audit log", icon: "activity", show: () => can.viewAudit },
        ],
      },
    ]
  }

  const visibleGroups = () =>
    groups()
      .map((group) => ({ ...group, items: group.items.filter((item) => item.show()) }))
      .filter((group) => group.items.length > 0)

  const sectionLabel = () => {
    if (isMember()) return "Your access"
    if (path() === "/account") return "Account"
    for (const group of visibleGroups()) {
      const item = group.items.find((entry) => entry.href === path())
      if (item) return item.label
    }
    return path() === "/" ? "Overview" : "Console"
  }

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandOpen(true)
      }
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest("[data-popover]")) {
        setUserOpen(false)
        setOrgOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onClick)
    onCleanup(() => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onClick)
    })
  })

  return (
    <div class="min-h-dvh lg:flex">
      <Show when={mobileOpen()}>
        <div class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      </Show>

      <aside
        class={cx(
          "fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-line bg-canvas-elevated transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          mobileOpen() ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div class="flex h-14 items-center justify-between border-b border-line px-4">
          <A href="/" class="flex items-center rounded-lg" aria-label="Ballm Code console home">
            <Logo />
          </A>
          <IconButton
            class="lg:hidden"
            label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="x" class="size-4" />
          </IconButton>
        </div>

        <div class="px-3 py-3">
          <div class="relative" data-popover>
            <button
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-left transition hover:bg-surface-hover"
              aria-haspopup="listbox"
              aria-expanded={orgOpen()}
              onClick={() => setOrgOpen((current) => !current)}
            >
              <span class="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-[11px] font-semibold text-accent">
                {session.org()?.name.slice(0, 2).toUpperCase()}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[12.5px] font-medium text-ink">{session.org()?.name}</span>
                <span class="block truncate text-[11px] capitalize text-ink-subtle">{session.session()?.role}</span>
              </span>
              <Icon name="chevron-down" class="size-3.5 shrink-0 text-ink-subtle" />
            </button>

            <Show when={orgOpen()}>
              <div
                class="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-2xl"
                role="listbox"
              >
                <For each={session.session()?.orgs ?? []}>
                  {(org) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={org.id === session.org()?.id}
                      class={cx(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] transition",
                        org.id === session.org()?.id
                          ? "bg-accent-soft text-accent"
                          : "text-ink hover:bg-surface-hover",
                      )}
                      onClick={() => {
                        setOrgOpen(false)
                        void session.switchOrg(org.id)
                      }}
                    >
                      <span class="truncate">{org.name}</span>
                      <span class="text-[10.5px] capitalize opacity-70">
                        {org.kind === "personal" ? "Personal" : org.role}
                      </span>
                    </button>
                  )}
                </For>
                <Show when={(session.session()?.orgs.length ?? 0) <= 1}>
                  <p class="px-2.5 py-2 text-[11.5px] text-ink-subtle">You belong to one workspace.</p>
                </Show>
                <div class="mt-1 border-t border-line pt-1">
                  <A
                    href="/workspaces/new"
                    onClick={() => setOrgOpen(false)}
                    class="flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] font-medium text-ink transition hover:bg-surface-hover"
                  >
                    <Icon name="plus" class="size-3.5 text-ink-subtle" />
                    Create workspace
                  </A>
                </div>
              </div>
            </Show>
          </div>
        </div>

        <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Console navigation">
          <Show
            when={!isMember()}
            fallback={
              <div class="space-y-1">
                <NavLink href="/" label="Your access" icon="monitor" active={path() === "/"} onNavigate={() => setMobileOpen(false)} />
              </div>
            }
          >
            <For each={visibleGroups()}>
              {(group) => (
                <div class="mb-5">
                  <p class="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                    {group.label}
                  </p>
                  <div class="space-y-0.5">
                    <For each={group.items}>
                      {(item) => (
                        <NavLink
                          href={item.href}
                          label={item.label}
                          icon={item.icon}
                          active={path() === item.href}
                          onNavigate={() => setMobileOpen(false)}
                        />
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </Show>

          <Show when={!isMember()}>
            <div class="mb-5">
              <p class="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                Account
              </p>
              <NavLink
                href="/account"
                label="Account"
                icon="key"
                active={path() === "/account"}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </Show>
        </nav>

        <div class="border-t border-line p-3">
          <div class="mb-2 flex items-center gap-1">
            <IconButton label={`Theme: ${theme()}`} onClick={cycleTheme} class="flex-1">
              <Icon name={theme() === "light" ? "sun" : theme() === "dark" ? "moon" : "monitor"} class="size-4" />
            </IconButton>
            <IconButton label="Open command menu" onClick={() => setCommandOpen(true)} class="flex-1">
              <Icon name="command" class="size-4" />
            </IconButton>
            <a
              href="/console/device"
              class="grid h-8 flex-1 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-hover hover:text-ink"
              aria-label="Approve a device"
              title="Approve a device"
            >
              <Icon name="terminal" class="size-4" />
            </a>
          </div>

          <div class="relative" data-popover>
            <button
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-surface-hover"
              aria-haspopup="menu"
              aria-expanded={userOpen()}
              onClick={() => setUserOpen((current) => !current)}
            >
              <Avatar name={session.user()?.name} email={session.user()?.email ?? ""} size="sm" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[12px] font-medium text-ink">
                  {session.user()?.name ?? session.user()?.email}
                </span>
                <span class="block truncate text-[10.5px] text-ink-subtle">{session.user()?.email}</span>
              </span>
              <Icon name="chevron-down" class="size-3.5 shrink-0 text-ink-subtle" />
            </button>

            <Show when={userOpen()}>
              <div
                class="absolute bottom-[calc(100%+6px)] left-0 right-0 z-50 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-2xl"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] text-ink transition hover:bg-surface-hover"
                  onClick={() => {
                    setUserOpen(false)
                    navigate("/account")
                  }}
                >
                  <Icon name="key" class="size-3.5 text-ink-subtle" /> Account settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] text-danger transition hover:bg-danger-soft"
                  onClick={() => {
                    setUserOpen(false)
                    void session.signOut()
                  }}
                >
                  <Icon name="logout" class="size-3.5" /> Sign out
                </button>
              </div>
            </Show>
          </div>
        </div>
      </aside>

      <div class="min-w-0 flex-1">
        <header class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/80 px-4 backdrop-blur-xl sm:px-6">
          <IconButton class="lg:hidden" label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Icon name="menu" class="size-4" />
          </IconButton>
          <div class="flex min-w-0 items-center gap-2 text-[12.5px]">
            <span class="truncate text-ink-muted">{session.org()?.name}</span>
            <Icon name="chevron-right" class="size-3 shrink-0 text-ink-subtle" />
            <span class="truncate font-medium text-ink">{sectionLabel()}</span>
          </div>
          <div class="ml-auto flex items-center gap-1.5">
            <Show when={session.session()?.role !== "member"}>
              <button
                type="button"
                class="hidden h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[11.5px] text-ink-subtle transition hover:text-ink sm:inline-flex"
                onClick={() => setCommandOpen(true)}
              >
                <Icon name="search" class="size-3.5" />
                Search
                <kbd class="ml-1 rounded border border-line bg-canvas-elevated px-1 py-0.5 font-mono text-[10px]">
                  ⌘K
                </kbd>
              </button>
            </Show>
            <Show when={session.session()?.role === "member"}>
              <Badge tone="neutral">Member</Badge>
            </Show>
            <IconButton label="Approve a device" class="sm:hidden" onClick={() => navigate("/device")}>
              <Icon name="terminal" class="size-4" />
            </IconButton>
          </div>
        </header>

        <main id="main" class="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
          {props.children}
        </main>
      </div>

      <CommandMenu
        open={commandOpen()}
        onOpenChange={setCommandOpen}
        groups={visibleGroups()}
        isMember={isMember()}
      />
    </div>
  )
}

function NavLink(props: {
  href: string
  label: string
  icon: IconName
  active: boolean
  onNavigate: () => void
}) {
  return (
    <A
      href={props.href}
      onClick={props.onNavigate}
      aria-current={props.active ? "page" : undefined}
      class={cx(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium transition-colors",
        props.active
          ? "bg-accent-soft text-accent"
          : "text-ink-muted hover:bg-surface-hover hover:text-ink",
      )}
    >
      <Icon
        name={props.icon}
        class={cx("size-4 transition-colors", props.active ? "text-accent" : "text-ink-subtle group-hover:text-ink")}
      />
      {props.label}
    </A>
  )
}

export function AccessDenied(props: { title?: string }) {
  const session = useSession()
  return (
    <div class="mx-auto max-w-md py-16 text-center">
      <span class="mx-auto grid size-12 place-items-center rounded-xl border border-line bg-surface-strong text-ink-muted">
        <Icon name="lock" class="size-5" />
      </span>
      <h1 class="mt-4 text-[18px] font-semibold text-ink">{props.title ?? "You do not have access"}</h1>
      <p class="mt-1 text-[13px] leading-6 text-ink-muted">
        Your role in {session.org()?.name ?? "this organization"} is{" "}
        <span class="font-medium text-ink">{session.session()?.role}</span>. Ask an organization owner
        for access.
      </p>
      <Button class="mt-5" onClick={() => (window.location.href = "/console/account")}>
        Go to your account
      </Button>
    </div>
  )
}

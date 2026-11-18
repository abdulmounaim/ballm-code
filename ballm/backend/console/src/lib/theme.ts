import { createSignal } from "solid-js"

export type Theme = "light" | "dark" | "system"

const STORAGE_KEY = "ballm.console.theme"

function stored(): Theme {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === "light" || value === "dark" || value === "system" ? value : "system"
}

const [theme, setThemeSignal] = createSignal<Theme>(stored())

export function applyTheme(mode: Theme) {
  const root = document.documentElement
  if (mode === "system") root.removeAttribute("data-theme")
  else root.dataset.theme = mode

  const effective =
    mode === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", effective === "light" ? "#f5f7fb" : "#070a12")
}

export function setTheme(mode: Theme) {
  localStorage.setItem(STORAGE_KEY, mode)
  setThemeSignal(mode)
  applyTheme(mode)
}

export function cycleTheme() {
  const current = theme()
  setTheme(current === "system" ? "light" : current === "light" ? "dark" : "system")
}

export { theme }

applyTheme(theme())

matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (theme() === "system") applyTheme("system")
})

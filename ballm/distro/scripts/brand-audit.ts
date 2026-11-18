#!/usr/bin/env bun
import { existsSync, statSync } from "node:fs"
import path from "node:path"
import { Brand } from "../../../packages/schema/src/brand"

// Guards the identity that ships to users: app IDs, update feeds, deep links, assets, and the
// managed policy that makes Ballm the only usable provider. Run from `ballm/distro` or `verify.sh`.
const root = path.resolve(import.meta.dir, "../../..")

const failures: string[] = []
let checks = 0

function check(name: string, ok: boolean, detail?: string) {
  checks += 1
  if (ok) return
  failures.push(detail ? `${name}: ${detail}` : name)
}

function read(file: string) {
  return Bun.file(path.join(root, file)).text()
}

function asset(name: string, minimum: number) {
  const file = path.join(root, name)
  const ok = existsSync(file) && statSync(file).size >= minimum
  check(`asset ${name}`, ok, ok ? undefined : `missing or smaller than ${minimum} bytes`)
}

function policyStatements(text: string) {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, "")) as {
    policies: Array<{ action: string; resource: string; effect: string }>
  }
}

function has(statements: ReturnType<typeof policyStatements>["policies"], action: string, resource: string, effect: string) {
  return statements.some((item) => item.action === action && item.resource === resource && item.effect === effect)
}

const desktopConfig = await read("packages/desktop/electron-builder.config.ts")
const desktopConstants = await read("packages/desktop/src/main/constants.ts")
const desktopHtml = await read("packages/desktop/src/renderer/index.html")
const appHtml = await read("packages/app/index.html")
const appManifest = JSON.parse(await read("packages/app/manifest.json"))
const about = await read("packages/app/src/settings/about/about.tsx")

check("production app ID", Brand.appID.prod === "com.ballm.code", Brand.appID.prod)
check("channel app IDs are distinct", new Set(Object.values(Brand.appID)).size === 3)
check("deep-link protocol", Brand.protocol === "ballm", Brand.protocol)
check(
  "update feeds are Ballm-owned",
  Object.values(Brand.update.urls).every(
    (url) => url.startsWith("https://updates.ballm.internal/desktop/") && url.endsWith("/"),
  ),
)
check("CLI install path", Brand.cli.installDir === ".ballm" && Brand.cli.command === "ballm")

for (const token of ["Brand.appID", "Brand.update", "Brand.protocol", "Brand.linuxExecutable"]) {
  check(`desktop config uses ${token}`, desktopConfig.includes(token))
}
check("desktop config has no upstream feed", !desktopConfig.includes("opencode.ai/update"))
check("desktop config has no upstream app ID", !desktopConfig.includes("ai.opencode.desktop"))
check("desktop identity comes from Brand", desktopConstants.includes('from "@opencode/schema/brand"'))
check("desktop window title", desktopHtml.includes(`>${Brand.name}<`))
check("web title", appHtml.includes(`>${Brand.name}<`))
check("web manifest name", appManifest.name === Brand.name, appManifest.name)
check("web manifest short name", appManifest.short_name === Brand.shortName, appManifest.short_name)
check("about keeps attribution", about.includes("Brand.attribution"))

for (const channel of ["dev", "beta", "prod"] as const) {
  asset(`packages/desktop/icons/${channel}/icon.icns`, 10_000)
  asset(`packages/desktop/icons/${channel}/icon.ico`, 5_000)
  asset(`packages/desktop/icons/${channel}/icon.png`, 2_000)
  asset(`packages/desktop/icons/${channel}/128x128@2x.png`, 2_000)
}

for (const file of ["icon.icns", "icon.ico", "icon.png", "128x128.png", "dock.png"]) {
  asset(`packages/desktop/resources/icons/${file}`, 500)
}

for (const file of [
  "packages/ui/src/assets/favicon/favicon.svg",
  "packages/ui/src/assets/favicon/favicon.ico",
  "packages/ui/src/assets/favicon/web-app-manifest-192x192.png",
  "packages/ui/src/assets/favicon/web-app-manifest-512x512.png",
  "packages/app/public/favicon.svg",
  "packages/app/public/favicon.ico",
  "packages/app/public/social-share.png",
  "packages/app/public/web-app-manifest-192x192.png",
  "packages/app/public/web-app-manifest-512x512.png",
]) {
  asset(file, 200)
}

const metainfo = await read("packages/desktop/resources/com.ballm.code.metainfo.xml")
check("metainfo app ID", metainfo.includes(`<id>${Brand.appID.prod}</id>`))
check("metainfo product name", metainfo.includes(`<name>${Brand.name}</name>`))
check("metainfo developer", metainfo.includes(`<developer id="${Brand.developerID}">`))

for (const file of ["ballm/managed/linux/opencode.jsonc", "ballm/managed/windows/opencode.jsonc"]) {
  const policies = policyStatements(await read(file)).policies
  check(`${file} denies every provider`, has(policies, "provider.use", "*", "deny"))
  check(`${file} allows Ballm`, has(policies, "provider.use", "ballm", "allow"))
  check(`${file} denies other integrations`, has(policies, "integration.connect", "*", "deny"))
  check(`${file} allows the Ballm integration`, has(policies, "integration.connect", "ballm", "allow"))
  check(`${file} denies external plugins`, has(policies, "plugin.use", "*", "deny"))
}

for (const file of ["packages/desktop/src/renderer/index.html", "packages/app/index.html", "packages/app/manifest.json"]) {
  check(`${file} has no upstream identity`, !(await read(file)).includes("OpenCode"))
}

if (failures.length > 0) {
  console.error(`brand audit failed (${failures.length} of ${checks} checks):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`brand audit: ${checks} checks passed`)

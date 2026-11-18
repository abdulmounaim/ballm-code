#!/usr/bin/env bun
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { Resvg } from "@resvg/resvg-js"
import png2icons from "png2icons"

const root = path.resolve(import.meta.dir, "../../..")
const source = path.join(root, "ballm/distro/branding/source")
const icons = path.join(root, "packages/desktop/icons")
const publicDir = path.join(root, "packages/app/public")

const mark = await Bun.file(path.join(source, "mark.svg")).text()
const appIcon = await Bun.file(path.join(source, "app-icon.svg")).text()

const render = (svg: string, size: number) =>
  new Resvg(svg, { fitTo: { mode: "width", value: size }, background: "transparent" }).render().asPng()

const write = async (file: string, data: Uint8Array | Buffer | string) => {
  await mkdir(path.dirname(file), { recursive: true })
  await Bun.write(file, data)
}

const required = (value: Buffer | null) => {
  if (!value) throw new Error("icon generation failed")
  return value
}

const ico = (png: Uint8Array) => required(png2icons.createICO(Buffer.from(png), png2icons.BILINEAR, 0, true))
const icns = (png: Uint8Array) => required(png2icons.createICNS(Buffer.from(png), png2icons.BILINEAR, 0))

async function generateChannel(channel: "dev" | "beta" | "prod") {
  const tint = channel === "dev" ? "#F59E0B" : channel === "beta" ? "#38BDF8" : "#FFFFFF"
  const background = channel === "dev" ? "#111827" : channel === "beta" ? "#0F172A" : "#0B1220"
  const iconSvg = appIcon.replaceAll("#FFFFFF", tint).replaceAll("#0B1220", background)
  const icon1024 = render(iconSvg, 1024)
  const icon256 = render(iconSvg, 256)
  const dir = path.join(icons, channel)
  await rm(dir, { recursive: true, force: true })

  await write(path.join(dir, "icon.png"), render(iconSvg, 512))
  await write(path.join(dir, "dock.png"), render(iconSvg, 256))
  await write(path.join(dir, "icon.ico"), ico(icon256))
  await write(path.join(dir, "icon.icns"), icns(icon1024))
  await write(path.join(dir, "32x32.png"), render(iconSvg, 32))
  await write(path.join(dir, "64x64.png"), render(iconSvg, 64))
  await write(path.join(dir, "128x128.png"), render(iconSvg, 128))
  await write(path.join(dir, "128x128@2x.png"), render(iconSvg, 256))

  for (const size of [30, 44, 71, 89, 107, 142, 150, 284, 310]) {
    await write(path.join(dir, `Square${size}x${size}Logo.png`), render(iconSvg, size))
  }
  await write(path.join(dir, "StoreLogo.png"), render(iconSvg, 50))

  for (const [density, size] of [
    ["mdpi", 48],
    ["hdpi", 72],
    ["xhdpi", 96],
    ["xxhdpi", 144],
    ["xxxhdpi", 192],
  ] as const) {
    await write(path.join(dir, "android", `mipmap-${density}`, "ic_launcher.png"), render(iconSvg, size))
  }

  await write(path.join(dir, "ios", "AppIcon-60x60@3x.png"), render(iconSvg, 180))
}

await generateChannel("dev")
await generateChannel("beta")
await generateChannel("prod")

// Desktop renderer serves these from publicDir; the web app's icon plugin emits its own copies.
const uiFavicon = path.join(root, "packages/ui/src/assets/favicon")
const uiImages = path.join(root, "packages/ui/src/assets/images")
await write(path.join(uiFavicon, "favicon-96x96-v3.png"), render(mark, 96))
await write(path.join(uiFavicon, "favicon-96x96.png"), render(mark, 96))
await write(path.join(uiFavicon, "favicon-v3.ico"), ico(render(mark, 64)))
await write(path.join(uiFavicon, "favicon.ico"), ico(render(mark, 64)))
await write(path.join(uiFavicon, "favicon-v3.svg"), mark)
await write(path.join(uiFavicon, "favicon.svg"), mark)
await write(path.join(uiFavicon, "apple-touch-icon-v3.png"), render(mark, 180))
await write(path.join(uiFavicon, "apple-touch-icon.png"), render(mark, 180))
await write(path.join(uiFavicon, "web-app-manifest-192x192.png"), render(mark, 192))
await write(path.join(uiFavicon, "web-app-manifest-512x512.png"), render(mark, 512))

const social = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0B1220"/>
  <g transform="translate(72 80) scale(2.6)">
    <rect x="3" y="3" width="58" height="58" rx="14" stroke="#FFFFFF" stroke-width="4" fill="none"/>
    <path d="M20 15h13.5a9 9 0 0 1 0 18H20V15Z" fill="#FFFFFF"/>
    <path d="M20 31h15.5a9 9 0 0 1 0 18H20V31Z" fill="#FFFFFF"/>
  </g>
  <text x="72" y="430" fill="#FFFFFF" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="120" font-weight="700" letter-spacing="-4">ballm code</text>
  <text x="76" y="500" fill="#94A3B8" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="34">The internal coding agent</text>
</svg>`

await write(path.join(publicDir, "social-share.png"), render(social, 1200))
await write(path.join(uiImages, "social-share.png"), render(social, 1200))

console.log("generated Ballm icons in packages/desktop/icons and packages/app/public")

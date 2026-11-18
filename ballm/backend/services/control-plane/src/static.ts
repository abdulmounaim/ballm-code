import path from "node:path"
import type { Hono } from "hono"
import type { Deps } from "./deps"

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ")

/**
 * Serves the built console SPA. Assets are content-hashed by Vite and cached forever; the shell is
 * always revalidated so a deploy takes effect on the next navigation.
 */
export function consoleStaticRoutes(app: Hono<{ Variables: import("./deps").Variables }>, deps: Deps) {
  const root = consoleDirectory()

  app.get("/console", (c) => c.redirect("/console/", 308))

  app.on(["GET", "HEAD"], "/console/*", async (c) => {
    if (!(await Bun.file(path.join(root, "index.html")).exists())) {
      return c.html(
        `<!doctype html><meta charset="utf-8"><title>Ballm console</title>
        <main style="font:16px system-ui;max-width:38rem;margin:4rem auto;line-height:1.6">
          <h1>The console is not built</h1>
          <p>Build it with <code>make -C ballm console</code>, or set <code>BALLM_CONSOLE_DIR</code>.</p>
          <p>Looked in <code>${escapeHtml(root)}</code>.</p>
        </main>`,
        503,
      )
    }

    const requested = decodeURIComponent(c.req.path.slice("/console".length)) || "/"
    if (requested.includes("\0")) return c.text("Bad request", 400)

    const candidate = path.resolve(root, `.${requested}`)
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return c.text("Not found", 404)

    const file = Bun.file(candidate)
    const isAsset = (requested.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(requested)) && !requested.endsWith(".html")
    const exists = await file.exists()
    if (isAsset && !exists) return c.text("Not found", 404)

    const serveFile = isAsset ? file : Bun.file(path.join(root, "index.html"))
    const body = await serveFile.arrayBuffer()

    applySecurityHeaders(c, deps)
    c.header("content-security-policy", CSP)
    c.header("cross-origin-opener-policy", "same-origin")
    c.header("cross-origin-resource-policy", "same-origin")
    c.header(
      "permissions-policy",
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
    )
    c.header("cache-control", isAsset ? "public, max-age=31536000, immutable" : "no-cache")
    c.header("content-type", isAsset ? file.type || "application/octet-stream" : "text/html; charset=utf-8")
    return c.body(body)
  })

  return app
}

/** Adds the headers that apply to every control-plane response. */
export function applySecurityHeaders(c: import("hono").Context, deps: Deps) {
  c.header("x-content-type-options", "nosniff")
  c.header("x-frame-options", "DENY")
  c.header("referrer-policy", "no-referrer")
  if (deps.env.BALLM_PUBLIC_URL.startsWith("https://"))
    c.header("strict-transport-security", "max-age=31536000; includeSubDomains")
}

function consoleDirectory() {
  const configured = process.env.BALLM_CONSOLE_DIR?.trim()
  return path.resolve(configured || path.join(import.meta.dir, "../../../console/dist"))
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

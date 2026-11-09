import { Effect } from "effect"
import type { Credential } from "../credential.js"
import { product } from "./product.js"

/** Canonical server URL, without a trailing slash. Accepts a user answer or the environment default. */
export function normalizeServer(input: unknown) {
  return Effect.try({
    try: () => {
      const configured = process.env[product.envServer]
      const raw = firstNonEmpty(typeof input === "string" ? input : undefined, configured, product.defaultServer)
      const url = new URL(raw)
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("expected HTTP(S)")
      return `${url.origin}${url.pathname.replace(/\/+$/, "")}`
    },
    catch: (cause) => new Error(`Invalid Ballm server URL: ${cause instanceof Error ? cause.message : String(cause)}`),
  })
}

function firstNonEmpty(...values: (string | undefined)[]) {
  return values.find((value): value is string => typeof value === "string" && value.length > 0) ?? product.defaultServer
}

/** The Ballm server a credential signed in to. */
export function server(value: Credential.Value) {
  const stored = value.metadata?.[product.serverMetadataKey]
  return typeof stored === "string" && stored.length > 0 ? stored : product.defaultServer
}

/** Authenticates a control-plane request as the credential's member, in the selected org. */
export function headers(value: Credential.Key | Credential.OAuth) {
  const orgID = value.metadata?.[product.orgMetadataKey]
  return {
    authorization: `Bearer ${value.type === "oauth" ? value.access : value.key}`,
    ...(typeof orgID === "string" ? { "x-org-id": orgID } : {}),
  }
}

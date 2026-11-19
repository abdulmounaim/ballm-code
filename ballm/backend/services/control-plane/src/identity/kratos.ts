import type { ControlPlaneEnv } from "@ballm/platform/env"

export type IdentityFlow = "login" | "registration" | "recovery" | "settings" | "verification"

const flowPaths: Record<IdentityFlow, string> = {
  login: "/self-service/login/browser",
  registration: "/self-service/registration/browser",
  recovery: "/self-service/recovery/browser",
  settings: "/self-service/settings/browser",
  verification: "/self-service/verification/browser",
}

export interface IdentityAddress {
  readonly value: string
  readonly verified: boolean
  readonly status?: string
}

export interface IdentitySession {
  readonly id: string
  readonly active: boolean
  readonly identity: {
    readonly id: string
    readonly traits: { readonly email?: string; readonly name?: string }
    readonly verifiable_addresses?: readonly IdentityAddress[]
  }
}

/** Browser-facing flow URL. Kratos appends `?flow=` and redirects to the configured UI page. */
export function flowUrl(kind: IdentityFlow, returnTo: string) {
  const url = new URL(flowPaths[kind], "http://identity.invalid")
  url.searchParams.set("return_to", returnTo)
  return `${url.pathname}${url.search}`
}

/**
 * Reads the browser's Kratos session. The cookie is forwarded because the public API is served
 * through the control plane on the same origin.
 */
export async function identitySession(
  env: ControlPlaneEnv,
  token: string | undefined,
): Promise<IdentitySession | undefined> {
  if (!env.BALLM_KRATOS_PUBLIC_URL || !token) return undefined
  const response = await fetch(`${env.BALLM_KRATOS_PUBLIC_URL.replace(/\/+$/, "")}/sessions/whoami`, {
    headers: { accept: "application/json", cookie: `ory_kratos_session=${token}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 401 || response.status === 403) return undefined
  if (!response.ok) throw new Error(`Kratos whoami failed with ${response.status}`)
  const session = (await response.json()) as IdentitySession
  if (!session.active) return undefined
  return session
}

/** The verified address Kratos knows for this identity, or undefined when it is unverified. */
export function verifiedEmail(session: IdentitySession) {
  const email = session.identity.traits.email?.trim().toLowerCase()
  if (!email) return undefined
  const address = session.identity.verifiable_addresses?.find(
    (entry) => entry.value.trim().toLowerCase() === email && entry.verified,
  )
  if (!address) return undefined
  return email
}

export function identityName(session: IdentitySession) {
  const name = session.identity.traits.name?.trim()
  return name ? name : undefined
}

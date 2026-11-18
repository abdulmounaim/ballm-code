import { createHash } from "node:crypto"
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"

export interface OidcConnection {
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
  readonly scopes: string
  readonly allowedDomains: readonly string[]
  readonly groupClaim?: string
  readonly groupRoles?: Readonly<Record<string, string>>
}

interface Discovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  userinfo_endpoint?: string
}

export interface IdTokenClaims extends JWTPayload {
  email?: string
  email_verified?: boolean
  name?: string
  preferred_username?: string
  groups?: string[] | string
}

const discoveryCache = new Map<string, { value: Discovery; expiresAt: number }>()
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export async function discover(issuer: string) {
  const cached = discoveryCache.get(issuer)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const url = `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`OIDC discovery failed for ${issuer}: ${response.status}`)
  const value = (await response.json()) as Discovery
  if (!value.authorization_endpoint || !value.token_endpoint || !value.jwks_uri)
    throw new Error(`OIDC discovery for ${issuer} is missing endpoints`)
  discoveryCache.set(issuer, { value, expiresAt: Date.now() + 60 * 60 * 1000 })
  return value
}

export async function authorizationUrl(
  connection: OidcConnection,
  input: {
    redirectUri: string
    state: string
    nonce: string
    codeChallenge: string
  },
) {
  const config = await discover(connection.issuer)
  const url = new URL(config.authorization_endpoint)
  url.searchParams.set("client_id", connection.clientId)
  url.searchParams.set("redirect_uri", input.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", connection.scopes)
  url.searchParams.set("state", input.state)
  url.searchParams.set("nonce", input.nonce)
  url.searchParams.set("code_challenge", input.codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

export async function exchangeCode(
  connection: OidcConnection,
  input: { code: string; codeVerifier: string; redirectUri: string },
) {
  const config = await discover(connection.issuer)
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: connection.clientId,
    code_verifier: input.codeVerifier,
  })
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }
  if (connection.clientSecret) {
    headers.authorization = `Basic ${btoa(`${connection.clientId}:${connection.clientSecret}`)}`
  }

  const response = await fetch(config.token_endpoint, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`OIDC token exchange failed: ${response.status} ${text.slice(0, 300)}`)
  const token = JSON.parse(text) as { id_token?: string; access_token?: string; token_type?: string }
  if (!token.id_token) throw new Error("OIDC token response has no id_token")
  return token
}

export async function verifyIdToken(connection: OidcConnection, idToken: string, nonce: string) {
  const config = await discover(connection.issuer)
  const jwks = jwksCache.get(config.jwks_uri) ?? createRemoteJWKSet(new URL(config.jwks_uri))
  jwksCache.set(config.jwks_uri, jwks)

  const verified = await jwtVerify(idToken, jwks, {
    issuer: config.issuer,
    audience: connection.clientId,
    algorithms: ["RS256", "RS384", "RS512", "ES256", "ES384", "PS256", "EdDSA"],
  })
  const claims = verified.payload as IdTokenClaims
  if (claims.nonce !== nonce) throw new Error("OIDC nonce mismatch")
  if (claims.email_verified === false) throw new Error("OIDC email is not verified")
  if (typeof claims.email !== "string" || claims.email.length === 0) throw new Error("OIDC token has no email claim")
  return claims
}

export function emailDomain(email: string) {
  const at = email.lastIndexOf("@")
  if (at === -1) return ""
  return email.slice(at + 1).toLowerCase()
}

export function allowedByDomain(connection: OidcConnection, email: string) {
  if (connection.allowedDomains.length === 0) return true
  return connection.allowedDomains.includes(emailDomain(email))
}

export function roleForClaims(connection: OidcConnection, claims: IdTokenClaims) {
  if (!connection.groupClaim || !connection.groupRoles) return "member"
  const raw = (claims as Record<string, unknown>)[connection.groupClaim]
  const groups = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []
  const mapped = groups
    .map((group) => connection.groupRoles?.[group])
    .filter((role): role is string => role === "owner" || role === "admin" || role === "member")
  if (mapped.includes("owner")) return "owner"
  if (mapped.includes("admin")) return "admin"
  return "member"
}

export function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  return {
    verifier,
    challenge: base64url(createHash("sha256").update(verifier).digest()),
  }
}

function base64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url")
}

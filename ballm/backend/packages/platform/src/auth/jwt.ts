import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import {
  SignJWT,
  createRemoteJWKSet,
  exportJWK,
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose"

export interface AccessClaims {
  readonly sub: string
  readonly org: string
  readonly sid: string
  readonly jti: string
  readonly iat: number
  readonly exp: number
}

export interface AuthKeys {
  readonly kid: string
  readonly issuer: string
  readonly audience: string
  readonly privateKey: CryptoKey
  readonly publicKey: CryptoKey
  readonly jwk: Record<string, unknown>
  verify(token: string): Promise<AccessClaims>
}

export async function createAuthKeys(input: {
  privateKey: string
  publicKey: string
  kid: string
  issuer: string
  audience: string
}): Promise<AuthKeys> {
  const privateKey = await importPKCS8(normalizePem(input.privateKey), "EdDSA")
  const publicKey = await importSPKI(normalizePem(input.publicKey), "EdDSA")
  return {
    kid: input.kid,
    issuer: input.issuer,
    audience: input.audience,
    privateKey,
    publicKey,
    jwk: { ...(await exportJWK(publicKey)), kid: input.kid, alg: "EdDSA", use: "sig" },
    verify: (token) => verifyWithKey(token, publicKey, input.issuer, input.audience),
  }
}

export async function signAccessToken(
  keys: AuthKeys,
  input: { userId: string; orgId: string; sessionId: string; ttl: number },
) {
  return new SignJWT({ org: input.orgId, sid: input.sessionId })
    .setProtectedHeader({ alg: "EdDSA", kid: keys.kid })
    .setIssuer(keys.issuer)
    .setAudience(keys.audience)
    .setSubject(input.userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${input.ttl}s`)
    .sign(keys.privateKey)
}

export type AccessVerifier = (token: string) => Promise<AccessClaims>

/**
 * Gateway-side verification. A local public key avoids a network dependency; the JWKS URL lets
 * key rotation happen in the control plane without redeploying gateways.
 */
export async function createAccessVerifier(input: {
  publicKey?: string
  jwksUrl?: string
  issuer: string
  audience: string
}): Promise<AccessVerifier> {
  if (input.publicKey) {
    const key = await importSPKI(normalizePem(input.publicKey), "EdDSA")
    return (token) => verifyWithKey(token, key, input.issuer, input.audience)
  }
  const key = createRemoteJWKSet(new URL(input.jwksUrl ?? `${input.issuer}/.well-known/jwks.json`))
  return (token) => verifyWithKey(token, key, input.issuer, input.audience)
}

async function verifyWithKey(
  token: string,
  key: CryptoKey | JWTVerifyGetKey,
  issuer: string,
  audience: string,
): Promise<AccessClaims> {
  const verified = await jwtVerify(token, key, {
    issuer,
    audience,
    algorithms: ["EdDSA"],
  })
  const claims = verified.payload as JWTPayload & { org?: unknown; sid?: unknown }
  if (typeof claims.sub !== "string" || typeof claims.org !== "string" || typeof claims.sid !== "string")
    throw new Error("access token is missing sub, org, or sid")
  return {
    sub: claims.sub,
    org: claims.org,
    sid: claims.sid,
    jti: typeof claims.jti === "string" ? claims.jti : "",
    iat: claims.iat ?? 0,
    exp: claims.exp ?? 0,
  }
}

export async function generateAuthKeyPair() {
  const pair = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })
  return {
    privateKey: await exportPKCS8(pair.privateKey),
    publicKey: await exportSPKI(pair.publicKey),
  }
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url")
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

export function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function normalizePem(value: string) {
  const trimmed = value.trim()
  if (trimmed.includes("BEGIN")) return trimmed.replaceAll("\\n", "\n")
  return Buffer.from(trimmed, "base64").toString("utf8")
}

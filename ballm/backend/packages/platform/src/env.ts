import { readFileSync } from "node:fs"
import { z } from "zod"

/**
 * Environment is loaded from the process and, for local development, Bun's automatic `.env`.
 * Secret values can be inline or referenced with `<NAME>_FILE`, which is what containers and
 * Kubernetes secret mounts should use.
 */
const boolean = z
  .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
  .optional()
  .transform((value) => value === "1" || value === "true")

const integer = (fallback: number, minimum = 1) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === "" ? fallback : Number(value)))
    .pipe(z.number().int().min(minimum))

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === "" ? undefined : value.trim()))

const baseSchema = z.object({
  BALLM_ENV: z.enum(["development", "test", "production"]).default("development"),
  BALLM_REGION: z.string().default("local"),
  BALLM_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  BALLM_PUBLIC_URL: z.string().url().default("http://localhost:8787"),
  BALLM_GATEWAY_PUBLIC_URL: z.string().url().default("http://localhost:8788"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_READ_URL: optionalString,
  BALLM_DB_POOL_MAX: integer(20),
  REDIS_URL: optionalString,
  BALLM_JWT_ISSUER: optionalString,
  BALLM_JWT_AUDIENCE: z.string().default("ballm-code"),
  BALLM_JWT_KID: z.string().default("ballm-1"),
  BALLM_JWT_PRIVATE_KEY: optionalString,
  BALLM_JWT_PUBLIC_KEY: optionalString,
  BALLM_JWKS_URL: optionalString,
  BALLM_ACCESS_TTL: integer(300),
  BALLM_REFRESH_TTL: integer(2_592_000),
  BALLM_BROWSER_TTL: integer(28_800),
  BALLM_ENCRYPTION_KEY: optionalString,
  BALLM_ADMIN_TOKEN: optionalString,
  BALLM_TRUST_PROXY: boolean,
  BALLM_DEV_AUTH: boolean,
  BALLM_MIGRATE_ON_START: optionalString,
  BALLM_BOOTSTRAP_ORG_ID: z.string().default("org_ballm"),
  BALLM_BOOTSTRAP_ORG_SLUG: z.string().default("ballm"),
  BALLM_BOOTSTRAP_ORG_NAME: z.string().default("Ballm"),
  BALLM_BOOTSTRAP_ADMIN_EMAIL: z.string().default("admin@ballm.internal"),
  BALLM_BOOTSTRAP_MODELS: z.string().default("ballm-fast:Ballm Fast"),
  BALLM_BOOTSTRAP_SSO_ISSUER: optionalString,
  BALLM_BOOTSTRAP_SSO_CLIENT_ID: optionalString,
  BALLM_BOOTSTRAP_SSO_CLIENT_SECRET: optionalString,
  BALLM_BOOTSTRAP_SSO_ALLOWED_DOMAINS: z.string().default(""),
  BALLM_UPSTREAM_BASE_URL: optionalString,
  BALLM_UPSTREAM_API_KEY: optionalString,
  BALLM_GATEWAY_TIMEOUT_MS: integer(600_000),
  BALLM_GATEWAY_CONNECT_TIMEOUT_MS: integer(15_000),
  BALLM_GATEWAY_RATE_LIMIT_PER_MINUTE: integer(240),
  BALLM_AUTH_RATE_LIMIT_PER_MINUTE: integer(30),
})

export type BaseEnv = z.infer<typeof baseSchema> & {
  readonly jwtIssuer: string
  readonly migrateOnStart: boolean
}

export interface ControlPlaneEnv extends BaseEnv {
  readonly service: "control-plane"
  readonly port: number
  readonly jwtPrivateKey: string
  readonly jwtPublicKey: string
  readonly encryptionKey: string
  readonly adminToken: string
}

export interface GatewayEnv extends BaseEnv {
  readonly service: "gateway"
  readonly port: number
  readonly jwtPublicKey: string | undefined
  readonly jwksUrl: string
  readonly encryptionKey: string
}

export type Env = ControlPlaneEnv | GatewayEnv

export function loadBaseEnv(): BaseEnv {
  const parsed = baseSchema.parse(process.env)
  return {
    ...parsed,
    jwtIssuer: parsed.BALLM_JWT_ISSUER ?? parsed.BALLM_PUBLIC_URL,
    migrateOnStart:
      parsed.BALLM_MIGRATE_ON_START === undefined
        ? parsed.BALLM_ENV === "development"
        : parsed.BALLM_MIGRATE_ON_START === "1",
  }
}

export function loadControlPlaneEnv(): ControlPlaneEnv {
  const base = loadBaseEnv()
  const privateKey = readSecret("BALLM_JWT_PRIVATE_KEY")
  const publicKey = readSecret("BALLM_JWT_PUBLIC_KEY")
  const encryptionKey = readSecret("BALLM_ENCRYPTION_KEY")
  const adminToken = readSecret("BALLM_ADMIN_TOKEN") ?? (base.BALLM_ENV === "production" ? undefined : "dev-admin-token")

  if (!privateKey) throw new Error("BALLM_JWT_PRIVATE_KEY or BALLM_JWT_PRIVATE_KEY_FILE is required")
  if (!publicKey) throw new Error("BALLM_JWT_PUBLIC_KEY or BALLM_JWT_PUBLIC_KEY_FILE is required")
  if (!encryptionKey) throw new Error("BALLM_ENCRYPTION_KEY is required")
  if (!adminToken) throw new Error("BALLM_ADMIN_TOKEN is required in production")
  if (base.BALLM_ENV === "production" && base.BALLM_DEV_AUTH)
    throw new Error("BALLM_DEV_AUTH must not be enabled in production")

  return {
    ...base,
    service: "control-plane",
    port: Number(process.env.PORT ?? 8787),
    jwtPrivateKey: privateKey,
    jwtPublicKey: publicKey,
    encryptionKey,
    adminToken,
  }
}

export function loadGatewayEnv(): GatewayEnv {
  const base = loadBaseEnv()
  const encryptionKey = readSecret("BALLM_ENCRYPTION_KEY")
  if (base.BALLM_ENV === "production" && base.BALLM_DEV_AUTH)
    throw new Error("BALLM_DEV_AUTH must not be enabled in production")
  if (!encryptionKey) throw new Error("BALLM_ENCRYPTION_KEY is required")

  return {
    ...base,
    service: "gateway",
    port: Number(process.env.GATEWAY_PORT ?? 8788),
    jwtPublicKey: readSecret("BALLM_JWT_PUBLIC_KEY"),
    jwksUrl: base.BALLM_JWKS_URL ?? `${base.BALLM_PUBLIC_URL.replace(/\/+$/, "")}/.well-known/jwks.json`,
    encryptionKey,
  }
}

export function loadMigrationEnv() {
  const parsed = baseSchema.parse(process.env)
  return {
    ...parsed,
    jwtIssuer: parsed.BALLM_JWT_ISSUER ?? parsed.BALLM_PUBLIC_URL,
    migrateOnStart: true,
  }
}

/** Reads `<name>_FILE` first, then `<name>`. PEM newlines escaped by env files are restored. */
export function readSecret(name: string): string | undefined {
  const file = process.env[`${name}_FILE`]
  if (file) return normalizeSecret(readFileSync(file, "utf8"))
  return normalizeSecret(process.env[name])
}

function normalizeSecret(value: string | undefined) {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.includes("\\n") ? trimmed.replaceAll("\\n", "\n") : trimmed
}


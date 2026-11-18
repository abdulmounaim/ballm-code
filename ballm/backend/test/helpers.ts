import { randomUUID } from "node:crypto"
import type { Sql } from "@ballm/platform/db"
import { createAuthKeys, generateAuthKeyPair, type AuthKeys } from "@ballm/platform/auth"
import { createCache, type Cache } from "@ballm/platform/cache"
import { createDatabase, type Database } from "@ballm/platform/db"
import { migrate } from "@ballm/platform/db/migrate"
import type { ControlPlaneEnv, GatewayEnv } from "@ballm/platform/env"
import { createLogger, type Logger } from "@ballm/platform/logging"
import { createMetrics, type Metrics } from "@ballm/platform/metrics"
import { createSecretBox, generateEncryptionKey, type SecretBox } from "@ballm/platform/secrets"
import { createApp } from "../services/control-plane/src/app"
import { ensureMembership, ensureOrg, findOrCreateUser } from "../services/control-plane/src/store"
import { Catalog } from "../services/gateway/src/catalog"
import { createApp as createGatewayApp } from "../services/gateway/src/app"
import { UsageRecorder } from "../services/gateway/src/usage"

export const adminToken = "test-admin-token"

export async function testDatabase() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error("TEST_DATABASE_URL is required; run scripts/test.sh")
  const db = createDatabase({ url, max: 5 })
  await migrate(db.write)
  return db
}

export async function resetDatabase(sql: Sql) {
  await sql`
    TRUNCATE TABLE
      usage_events, audit_events, oidc_states, browser_sessions, refresh_tokens,
      device_codes, sessions, sso_connections, org_settings, org_policies,
      org_models, model_catalog, memberships, users, orgs
    RESTART IDENTITY CASCADE
  `
}

export async function testKeys() {
  const pair = await generateAuthKeyPair()
  return createAuthKeys({
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    kid: "test-key",
    issuer: "http://localhost:8787",
    audience: "ballm-code",
  })
}

export function baseEnv() {
  return {
    BALLM_ENV: "test" as const,
    BALLM_REGION: "test",
    BALLM_LOG_LEVEL: "error" as const,
    BALLM_PUBLIC_URL: "http://localhost:8787",
    BALLM_GATEWAY_PUBLIC_URL: "http://localhost:8788",
    DATABASE_URL: process.env.TEST_DATABASE_URL!,
    DATABASE_READ_URL: undefined,
    BALLM_DB_POOL_MAX: 5,
    REDIS_URL: undefined,
    BALLM_JWT_ISSUER: "http://localhost:8787",
    BALLM_JWT_AUDIENCE: "ballm-code",
    BALLM_JWT_KID: "test-key",
    BALLM_JWT_PRIVATE_KEY: undefined,
    BALLM_JWT_PUBLIC_KEY: undefined,
    BALLM_JWKS_URL: "http://localhost:8787/.well-known/jwks.json",
    BALLM_ACCESS_TTL: 300,
    BALLM_REFRESH_TTL: 2_592_000,
    BALLM_BROWSER_TTL: 28_800,
    BALLM_ENCRYPTION_KEY: process.env.BALLM_ENCRYPTION_KEY ?? generateEncryptionKey(),
    BALLM_ADMIN_TOKEN: adminToken,
    BALLM_TRUST_PROXY: false,
    BALLM_DEV_AUTH: true,
    BALLM_MIGRATE_ON_START: false,
    BALLM_BOOTSTRAP_ORG_ID: "org_test",
    BALLM_BOOTSTRAP_ORG_SLUG: "test",
    BALLM_BOOTSTRAP_ORG_NAME: "Test Org",
    BALLM_BOOTSTRAP_ADMIN_EMAIL: "admin@test.internal",
    BALLM_BOOTSTRAP_MODELS: "ballm-fast:Ballm Fast",
    BALLM_BOOTSTRAP_SSO_ISSUER: undefined,
    BALLM_BOOTSTRAP_SSO_CLIENT_ID: undefined,
    BALLM_BOOTSTRAP_SSO_CLIENT_SECRET: undefined,
    BALLM_BOOTSTRAP_SSO_ALLOWED_DOMAINS: "",
    BALLM_UPSTREAM_BASE_URL: undefined,
    BALLM_UPSTREAM_API_KEY: undefined,
    BALLM_GATEWAY_TIMEOUT_MS: 60_000,
    BALLM_GATEWAY_CONNECT_TIMEOUT_MS: 15_000,
    BALLM_GATEWAY_RATE_LIMIT_PER_MINUTE: 240,
    BALLM_AUTH_RATE_LIMIT_PER_MINUTE: 30,
    jwtIssuer: "http://localhost:8787",
    migrateOnStart: false,
  }
}

export function controlEnv(overrides: Partial<ControlPlaneEnv> = {}): ControlPlaneEnv {
  const base = baseEnv()
  return {
    ...base,
    ...overrides,
    service: "control-plane",
    port: 0,
    jwtPrivateKey: "test-private-key",
    jwtPublicKey: "test-public-key",
    encryptionKey: base.BALLM_ENCRYPTION_KEY!,
    adminToken,
  } as ControlPlaneEnv
}

export function gatewayEnv(overrides: Partial<GatewayEnv> = {}): GatewayEnv {
  const base = baseEnv()
  return {
    ...base,
    ...overrides,
    service: "gateway",
    port: 0,
    jwtPublicKey: undefined,
    jwksUrl: "http://localhost:8787/.well-known/jwks.json",
    encryptionKey: base.BALLM_ENCRYPTION_KEY!,
  } as GatewayEnv
}

export interface TestContext {
  db: Database
  cache: Cache
  secrets: SecretBox
  keys: AuthKeys
  logger: Logger
  metrics: Metrics
  env: ControlPlaneEnv
  app: ReturnType<typeof createApp>
  gatewayEnv: GatewayEnv
  catalog: Catalog
  usage: UsageRecorder
  gateway: ReturnType<typeof createGatewayApp>
  close(): Promise<void>
}

export async function setupContext(overrides: Partial<ControlPlaneEnv> = {}): Promise<TestContext> {
  const db = await testDatabase()
  await resetDatabase(db.write)
  const keys = await testKeys()
  const env = controlEnv(overrides)
  const gatewaySettings = gatewayEnv()
  const logger = createLogger({ service: "test", region: "test", level: "error" })
  const cache = await createCache(undefined, logger)
  const secrets = createSecretBox(env.encryptionKey)
  const metrics = createMetrics({ service: "test", region: "test" })
  const app = createApp({ db, env, keys, cache, logger, metrics, secrets })
  const catalog = new Catalog({ read: db.read, cache, secrets, logger, env: gatewaySettings })
  const usage = new UsageRecorder({ sql: db.write, logger, metrics, intervalMs: 10_000 })
  const gateway = createGatewayApp({
    db,
    env: gatewaySettings,
    cache,
    logger,
    metrics,
    verifier: keys.verify,
    catalog,
    usage,
  })

  return {
    db,
    cache,
    secrets,
    keys,
    logger,
    metrics,
    env,
    app,
    gatewayEnv: gatewaySettings,
    catalog,
    usage,
    gateway,
    async close() {
      await usage.close()
      await cache.close()
      await db.close()
    },
  }
}

export async function createTestOrg(
  ctx: TestContext,
  input: { id?: string; slug: string; name: string; email?: string; model?: { id: string; upstreamModel?: string } },
) {
  const org = await ensureOrg(ctx.db.write, { id: input.id, slug: input.slug, name: input.name })
  const user = await findOrCreateUser(ctx.db.write, { email: input.email ?? `owner@${input.slug}.internal` })
  await ensureMembership(ctx.db.write, user.id, org.id, "owner")
  if (input.model) {
    const model = await ctx.db.write<{ id: string }[]>`
      INSERT INTO model_catalog (id, name, upstream_model) VALUES (${input.model.id}, ${input.model.id}, ${input.model.upstreamModel ?? input.model.id})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, upstream_model = EXCLUDED.upstream_model
      RETURNING id
    `
    await ctx.db.write`INSERT INTO org_models (org_id, model_id) VALUES (${org.id}, ${model[0]!.id}) ON CONFLICT DO NOTHING`
  }
  return { org, user }
}

export function jsonRequest(path: string, body: unknown, token?: string) {
  return {
    path,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    } satisfies RequestInit,
  }
}

export function randomEmail(prefix = "dev") {
  return `${prefix}-${randomUUID()}@test.internal`
}

import { createAccessVerifier } from "@ballm/platform/auth"
import { createCache } from "@ballm/platform/cache"
import { createDatabase } from "@ballm/platform/db"
import { loadGatewayEnv } from "@ballm/platform/env"
import { createLogger } from "@ballm/platform/logging"
import { createMetrics } from "@ballm/platform/metrics"
import { createSecretBox } from "@ballm/platform/secrets"
import { createApp } from "./app"
import { Catalog } from "./catalog"
import { UsageRecorder } from "./usage"

const env = loadGatewayEnv()
const logger = createLogger({ service: "gateway", region: env.BALLM_REGION, level: env.BALLM_LOG_LEVEL })
const metrics = createMetrics({ service: "gateway", region: env.BALLM_REGION })
const db = createDatabase({ url: env.DATABASE_URL, readUrl: env.DATABASE_READ_URL, max: env.BALLM_DB_POOL_MAX })
const cache = await createCache(env.REDIS_URL, logger)
const secrets = createSecretBox(env.encryptionKey)
const verifier = await createAccessVerifier({
  publicKey: env.jwtPublicKey,
  jwksUrl: env.jwksUrl,
  issuer: env.jwtIssuer,
  audience: env.BALLM_JWT_AUDIENCE,
})
const catalog = new Catalog({ read: db.read, cache, secrets, logger, env })
const usage = new UsageRecorder({ sql: db.write, logger, metrics })

const unsubscribe = await catalog.subscribe()
const app = createApp({ db, env, cache, logger, metrics, verifier, catalog, usage })
const server = Bun.serve({ port: env.port, fetch: app.fetch })

logger.info("gateway listening", { port: server.port, gatewayUrl: env.BALLM_GATEWAY_PUBLIC_URL })

let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  logger.info("shutting down", { signal })
  await server.stop(true)
  await unsubscribe()
  await usage.close()
  await cache.close()
  await db.close()
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))

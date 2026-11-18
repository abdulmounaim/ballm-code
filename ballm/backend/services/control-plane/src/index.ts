import { createAuthKeys } from "@ballm/platform/auth"
import { createCache } from "@ballm/platform/cache"
import { createDatabase } from "@ballm/platform/db"
import { ensurePartitions, migrate } from "@ballm/platform/db/migrate"
import { loadControlPlaneEnv } from "@ballm/platform/env"
import { createLogger } from "@ballm/platform/logging"
import { createMetrics } from "@ballm/platform/metrics"
import { createSecretBox } from "@ballm/platform/secrets"
import { createApp } from "./app"
import { cleanupExpired, ensureBootstrap } from "./store"

const env = loadControlPlaneEnv()
const logger = createLogger({ service: "control-plane", region: env.BALLM_REGION, level: env.BALLM_LOG_LEVEL })
const metrics = createMetrics({ service: "control-plane", region: env.BALLM_REGION })
const db = createDatabase({ url: env.DATABASE_URL, readUrl: env.DATABASE_READ_URL, max: env.BALLM_DB_POOL_MAX })
const cache = await createCache(env.REDIS_URL, logger)
const secrets = createSecretBox(env.encryptionKey)
const keys = await createAuthKeys({
  privateKey: env.jwtPrivateKey,
  publicKey: env.jwtPublicKey,
  kid: env.BALLM_JWT_KID,
  issuer: env.jwtIssuer,
  audience: env.BALLM_JWT_AUDIENCE,
})

if (env.migrateOnStart) await migrate(db.write)
else await ensurePartitions(db.write)

const org = await ensureBootstrap(db.write, env, secrets)
logger.info("bootstrap organization ready", { org: org.slug })

const app = createApp({ db, env, keys, cache, logger, metrics, secrets })
const server = Bun.serve({ port: env.port, fetch: app.fetch })

const maintenance = setInterval(
  () => {
    void ensurePartitions(db.write).catch((error) => logger.error("partition maintenance failed", { error: String(error) }))
    void cleanupExpired(db.write).catch((error) => logger.error("expiry cleanup failed", { error: String(error) }))
  },
  60 * 60 * 1000,
)

logger.info("control plane listening", { port: server.port, publicUrl: env.BALLM_PUBLIC_URL })

let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  logger.info("shutting down", { signal })
  clearInterval(maintenance)
  await server.stop(true)
  await cache.close()
  await db.close()
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))

import { Redis } from "ioredis"

export interface Cache {
  readonly kind: "redis" | "memory"
  get(key: string): Promise<string | undefined>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  del(key: string): Promise<void>
  incr(key: string, ttlSeconds: number): Promise<number>
  publish(channel: string, message: string): Promise<void>
  subscribe(channel: string, handler: (message: string) => void): Promise<() => Promise<void>>
  ping(): Promise<boolean>
  close(): Promise<void>
}

/**
 * Redis is the shared cache and rate-limit store. A process-local fallback keeps development and
 * single-replica deployments working, but multi-region rate limits and instant revocation need
 * a replicated Redis/Valkey.
 */
export async function createCache(url: string | undefined, logger?: { warn(message: string, fields?: object): void }) {
  if (!url) {
    logger?.warn("REDIS_URL is not set; using process-local cache")
    return memoryCache()
  }

  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3_000,
  })
  redis.on("error", (error) => logger?.warn("redis error", { error: error.message }))

  try {
    await redis.connect()
    await redis.ping()
  } catch (error) {
    logger?.warn("redis unavailable; using process-local cache", {
      error: error instanceof Error ? error.message : String(error),
    })
    redis.disconnect()
    return memoryCache()
  }

  const subscribers = new Set<Redis>()

  return {
    kind: "redis",
    async get(key) {
      return (await redis.get(key)) ?? undefined
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, "EX", ttlSeconds)
    },
    async del(key) {
      await redis.del(key)
    },
    async incr(key, ttlSeconds) {
      const result = await redis.multi().incr(key).expire(key, ttlSeconds, "NX").exec()
      const count = result?.[0]?.[1]
      return typeof count === "number" ? count : Number(count ?? 0)
    },
    async publish(channel, message) {
      await redis.publish(channel, message)
    },
    async subscribe(channel, handler) {
      const subscriber = redis.duplicate({ lazyConnect: true, enableOfflineQueue: true })
      subscribers.add(subscriber)
      subscriber.on("error", (error) => logger?.warn("redis subscriber error", { error: error.message }))
      subscriber.on("message", (received, message) => {
        if (received === channel) handler(message)
      })
      await subscriber.connect()
      await subscriber.subscribe(channel)
      return async () => {
        subscribers.delete(subscriber)
        await subscriber.quit()
      }
    },
    async ping() {
      return (await redis.ping()) === "PONG"
    },
    async close() {
      await Promise.all(Array.from(subscribers, (subscriber) => subscriber.quit()))
      await redis.quit()
    },
  } satisfies Cache
}

export function memoryCache(): Cache {
  const values = new Map<string, { value: string; expiresAt: number }>()
  const channels = new Map<string, Set<(message: string) => void>>()

  const expire = () => {
    const now = Date.now()
    for (const [key, entry] of values) if (entry.expiresAt <= now) values.delete(key)
  }

  return {
    kind: "memory",
    async get(key) {
      expire()
      return values.get(key)?.value
    },
    async set(key, value, ttlSeconds) {
      values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
    },
    async del(key) {
      values.delete(key)
    },
    async incr(key, ttlSeconds) {
      expire()
      const entry = values.get(key)
      const next = entry ? Number(entry.value) + 1 : 1
      values.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? Date.now() + ttlSeconds * 1000 })
      return next
    },
    async publish(channel, message) {
      for (const handler of channels.get(channel) ?? []) handler(message)
    },
    async subscribe(channel, handler) {
      const handlers = channels.get(channel) ?? new Set()
      handlers.add(handler)
      channels.set(channel, handlers)
      return async () => {
        handlers.delete(handler)
        if (handlers.size === 0) channels.delete(channel)
      }
    },
    async ping() {
      return true
    },
    async close() {
      values.clear()
      channels.clear()
    },
  } satisfies Cache
}

import type { Cache } from "@ballm/platform/cache"
import type { Sql } from "@ballm/platform/db"
import type { GatewayEnv } from "@ballm/platform/env"
import type { Logger } from "@ballm/platform/logging"
import type { SecretBox } from "@ballm/platform/secrets"

export interface GatewayModel {
  readonly id: string
  readonly name: string
  readonly upstreamModel: string
  readonly contextLimit?: number
  readonly outputLimit?: number
}

export interface OrgCatalog {
  readonly models: readonly GatewayModel[]
  readonly upstreamBaseUrl?: string
  readonly upstreamApiKey?: string
}

interface CachedCatalog {
  models: GatewayModel[]
  upstreamBaseUrl?: string
  encryptedUpstreamApiKey?: string
}

const TTL_SECONDS = 30

/**
 * Per-org model and upstream configuration. The gateway caches in process and in Redis, and
 * invalidates through a Redis channel when the admin API changes an org.
 */
export class Catalog {
  private readonly memory = new Map<string, { value: CachedCatalog; expiresAt: number }>()

  constructor(
    private readonly input: {
      read: Sql
      cache: Cache
      secrets: SecretBox
      logger: Logger
      env: GatewayEnv
    },
  ) {}

  async get(orgId: string): Promise<OrgCatalog | undefined> {
    const cached = await this.cached(orgId)
    if (!cached) return undefined
    return {
      models: cached.models,
      upstreamBaseUrl: cached.upstreamBaseUrl,
      upstreamApiKey: cached.encryptedUpstreamApiKey
        ? this.input.secrets.open(cached.encryptedUpstreamApiKey)
        : undefined,
    }
  }

  async invalidate(orgId: string) {
    this.memory.delete(orgId)
    await this.input.cache.del(`ballm:orgcfg:${orgId}`)
  }

  async subscribe() {
    return this.input.cache.subscribe("ballm:invalidate", (orgId) => {
      this.memory.delete(orgId)
    })
  }

  private async cached(orgId: string) {
    const local = this.memory.get(orgId)
    if (local && local.expiresAt > Date.now()) return local.value

    const remote = await this.input.cache.get(`ballm:orgcfg:${orgId}`)
    if (remote) {
      const value = JSON.parse(remote) as CachedCatalog
      this.memory.set(orgId, { value, expiresAt: Date.now() + TTL_SECONDS * 1000 })
      return value
    }

    const [models, settings] = await Promise.all([
      this.input.read<{ id: string; name: string; upstream_model: string; context_limit: number | null; output_limit: number | null }[]>`
        SELECT m.id, m.name, m.upstream_model, m.context_limit, m.output_limit
        FROM org_models om
        JOIN model_catalog m ON m.id = om.model_id
        WHERE om.org_id = ${orgId} AND om.enabled AND m.enabled
        ORDER BY m.name
      `,
      this.input.read<{ upstream_base_url: string | null; encrypted_upstream_api_key: string | null }[]>`
        SELECT upstream_base_url, encrypted_upstream_api_key
        FROM org_settings WHERE org_id = ${orgId} LIMIT 1
      `,
    ])

    const value: CachedCatalog = {
      models: models.map((model) => ({
        id: model.id,
        name: model.name,
        upstreamModel: model.upstream_model,
        contextLimit: model.context_limit ?? undefined,
        outputLimit: model.output_limit ?? undefined,
      })),
      upstreamBaseUrl: settings[0]?.upstream_base_url ?? undefined,
      encryptedUpstreamApiKey: settings[0]?.encrypted_upstream_api_key ?? undefined,
    }
    await this.input.cache.set(`ballm:orgcfg:${orgId}`, JSON.stringify(value), TTL_SECONDS)
    this.memory.set(orgId, { value, expiresAt: Date.now() + TTL_SECONDS * 1000 })
    this.input.logger.debug("loaded org catalog", { orgId, models: value.models.length })
    return value
  }
}

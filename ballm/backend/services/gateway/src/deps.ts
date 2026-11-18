import type { AccessClaims, AccessVerifier } from "@ballm/platform/auth"
import type { Cache } from "@ballm/platform/cache"
import type { Database } from "@ballm/platform/db"
import type { GatewayEnv } from "@ballm/platform/env"
import type { Logger } from "@ballm/platform/logging"
import type { Metrics } from "@ballm/platform/metrics"
import type { Catalog } from "./catalog"
import type { UsageRecorder } from "./usage"

export type Variables = {
  requestId: string
  claims: AccessClaims
  logger: Logger
}

export interface GatewayDeps {
  readonly db: Database
  readonly env: GatewayEnv
  readonly cache: Cache
  readonly logger: Logger
  readonly metrics: Metrics
  readonly verifier: AccessVerifier
  readonly catalog: Catalog
  readonly usage: UsageRecorder
}

import type { Hono } from "hono"
import type { AccessClaims, AuthKeys } from "@ballm/platform/auth"
import type { Cache } from "@ballm/platform/cache"
import type { Database } from "@ballm/platform/db"
import type { ControlPlaneEnv } from "@ballm/platform/env"
import type { Logger } from "@ballm/platform/logging"
import type { Metrics } from "@ballm/platform/metrics"
import type { SecretBox } from "@ballm/platform/secrets"
import type { ConsoleContext } from "./console/types"

export type Variables = {
  requestId: string
  claims: AccessClaims
  console: ConsoleContext
  logger: Logger
}

export type App = Hono<{ Variables: Variables }>

export interface Deps {
  readonly db: Database
  readonly env: ControlPlaneEnv
  readonly keys: AuthKeys
  readonly cache: Cache
  readonly logger: Logger
  readonly metrics: Metrics
  readonly secrets: SecretBox
}

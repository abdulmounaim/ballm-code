export interface Model {
  readonly id: string
  readonly name: string
}

export interface ServerConfig {
  readonly port: number
  readonly publicUrl: string
  readonly db: string
  readonly orgID: string
  readonly orgName: string
  readonly models: readonly Model[]
  readonly upstreamBaseUrl: string | undefined
  readonly upstreamApiKey: string | undefined
  readonly devEcho: boolean
  readonly allowDevApprove: boolean
  readonly accessTtl: number
  readonly refreshTtl: number
}

export function loadConfig(): ServerConfig {
  const port = Number(process.env.PORT ?? 8787)
  return {
    port,
    publicUrl: (process.env.BALLM_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, ""),
    db: process.env.BALLM_DB ?? "./ballm.db",
    orgID: process.env.BALLM_ORG_ID ?? "org_local",
    orgName: process.env.BALLM_ORG_NAME ?? "Local",
    models: parseModels(process.env.BALLM_MODELS ?? "ballm-fast:Ballm Fast"),
    upstreamBaseUrl: trimSlash(process.env.UPSTREAM_BASE_URL),
    upstreamApiKey: emptyToUndefined(process.env.UPSTREAM_API_KEY),
    devEcho: process.env.BALLM_DEV_ECHO === "1",
    allowDevApprove: process.env.BALLM_ALLOW_DEV_APPROVE !== "0",
    accessTtl: Number(process.env.BALLM_ACCESS_TTL ?? 3600),
    refreshTtl: Number(process.env.BALLM_REFRESH_TTL ?? 2592000),
  }
}

function parseModels(input: string): readonly Model[] {
  return input
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const separator = entry.indexOf(":")
      if (separator === -1) return { id: entry, name: entry }
      return { id: entry.slice(0, separator).trim(), name: entry.slice(separator + 1).trim() }
    })
}

function trimSlash(value: string | undefined) {
  return value ? value.replace(/\/+$/, "") : undefined
}

function emptyToUndefined(value: string | undefined) {
  return value && value.length > 0 ? value : undefined
}

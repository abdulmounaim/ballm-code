export type Role = "owner" | "admin" | "member"

export interface Org {
  id: string
  slug: string
  name: string
  role: Role
}

export interface User {
  id: string
  email: string
  name: string | null
}

export interface Capabilities {
  manageMembers: boolean
  manageOwners: boolean
  manageModels: boolean
  managePolicies: boolean
  manageSso: boolean
  manageUpstream: boolean
  viewAudit: boolean
  viewUsage: boolean
}

export interface Session {
  user: User
  orgs: Org[]
  org: Org
  role: Role
  csrf: string
  capabilities: Capabilities
}

export interface Member {
  id: string
  email: string
  name: string | null
  role: Role
  created_at: string
}

export interface CatalogModel {
  id: string
  name: string
  upstream_model: string
  context_limit: number | null
  output_limit: number | null
  enabled: boolean
  org_enabled: boolean
}

export interface PolicyStatement {
  action: string
  resource: string
  effect: "allow" | "deny"
}

export interface SsoConfig {
  configured: boolean
  redirectUri?: string
  issuer?: string
  clientId?: string
  scopes?: string
  allowedDomains?: string[]
  groupClaim?: string | null
  groupRoles?: Record<string, Role>
  enabled?: boolean
  hasClientSecret?: boolean
  updatedAt?: string
}

export interface UpstreamConfig {
  baseUrl: string | null
  hasApiKey: boolean
  fallbackConfigured: boolean
}

export interface SessionRow {
  id: string
  user_id: string
  email: string
  name: string | null
  role: Role
  auth_method: "device" | "sso" | "dev"
  user_agent: string | null
  ip: string | null
  created_at: string
  last_seen_at: string
}

export interface UsagePoint {
  day: string
  requests: number
  tokens: number
}

export interface UsageBreakdown {
  key: string
  label: string
  requests: number
  tokens: number
}

export interface AuditEvent {
  id: string
  at: string
  kind: string
  user_id: string | null
  email: string | null
  detail: unknown
}

export interface Overview {
  summary: {
    members: number
    activeSessions: number
    models: number
    requests30d: number
    tokens30d: number
    errors30d: number
    audit7d: number
  }
  usage: {
    byDay: UsagePoint[]
    byModel: UsageBreakdown[]
    byUser: UsageBreakdown[]
  }
  readiness: {
    upstream: boolean
    hasUpstreamKey: boolean
    sso: boolean
    owners: number
  }
  recent: AuditEvent[]
}

export interface DeviceState {
  signedIn: boolean
  user?: User
  org?: Org
  code?: string
  codeStatus?: "pending" | "expired" | "unknown"
}

export interface UpstreamTestResult {
  ok: boolean
  status: number
  latencyMs: number
  message: string
}

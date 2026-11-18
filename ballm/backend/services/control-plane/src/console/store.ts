import type { Sql } from "@ballm/platform/db"

export type Role = "owner" | "admin" | "member"

export interface ConsoleUser {
  id: string
  email: string
  name: string | null
}

export interface ConsoleOrg {
  id: string
  slug: string
  name: string
  role: Role
}

export interface ConsoleMember {
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

export interface ConsoleSession {
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

export async function userById(sql: Sql, userId: string) {
  const rows = await sql<ConsoleUser[]>`SELECT id, email, name FROM users WHERE id = ${userId} LIMIT 1`
  return rows[0]
}

export async function orgsWithRoles(sql: Sql, userId: string) {
  return sql<ConsoleOrg[]>`
    SELECT orgs.id, orgs.slug, orgs.name, memberships.role
    FROM orgs
    JOIN memberships ON memberships.org_id = orgs.id
    WHERE memberships.user_id = ${userId}
    ORDER BY orgs.name
  `
}

export async function roleInOrg(sql: Sql, userId: string, orgId: string) {
  const rows = await sql<{ role: Role }[]>`
    SELECT role FROM memberships WHERE user_id = ${userId} AND org_id = ${orgId} LIMIT 1
  `
  return rows[0]?.role
}

export async function overview(sql: Sql, orgId: string) {
  const rows = await sql<
    {
      members: number
      active_sessions: number
      models: number
      requests_30d: number
      tokens_30d: number
      errors_30d: number
      audit_7d: number
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM memberships WHERE org_id = ${orgId}) AS members,
      (SELECT count(*)::int FROM sessions
        WHERE org_id = ${orgId} AND revoked_at IS NULL AND last_seen_at > now() - interval '7 days') AS active_sessions,
      (SELECT count(*)::int FROM org_models om
        JOIN model_catalog m ON m.id = om.model_id
        WHERE om.org_id = ${orgId} AND om.enabled AND m.enabled) AS models,
      (SELECT count(*)::int FROM usage_events
        WHERE org_id = ${orgId} AND at > now() - interval '30 days') AS requests_30d,
      (SELECT coalesce(sum(total_tokens), 0)::bigint FROM usage_events
        WHERE org_id = ${orgId} AND at > now() - interval '30 days') AS tokens_30d,
      (SELECT count(*)::int FROM usage_events
        WHERE org_id = ${orgId} AND at > now() - interval '30 days' AND status >= 400) AS errors_30d,
      (SELECT count(*)::int FROM audit_events
        WHERE org_id = ${orgId} AND at > now() - interval '7 days') AS audit_7d
  `
  const row = rows[0]
  return {
    members: Number(row?.members ?? 0),
    activeSessions: Number(row?.active_sessions ?? 0),
    models: Number(row?.models ?? 0),
    requests30d: Number(row?.requests_30d ?? 0),
    tokens30d: Number(row?.tokens_30d ?? 0),
    errors30d: Number(row?.errors_30d ?? 0),
    audit7d: Number(row?.audit_7d ?? 0),
  }
}

export async function usageByDay(sql: Sql, orgId: string, days: number): Promise<UsagePoint[]> {
  const rows = await sql<{ day: string; requests: number; tokens: string }[]>`
    SELECT to_char(date_trunc('day', at), 'YYYY-MM-DD') AS day,
           count(*)::int AS requests,
           coalesce(sum(total_tokens), 0)::bigint AS tokens
    FROM usage_events
    WHERE org_id = ${orgId} AND at > now() - (${days}::int * interval '1 day')
    GROUP BY 1 ORDER BY 1
  `
  return rows.map((row) => ({ day: row.day, requests: Number(row.requests), tokens: Number(row.tokens) }))
}

export async function usageByModel(sql: Sql, orgId: string, days: number): Promise<UsageBreakdown[]> {
  const rows = await sql<{ key: string; label: string; requests: number; tokens: string }[]>`
    SELECT u.model_id AS key, coalesce(m.name, u.model_id) AS label,
           count(*)::int AS requests, coalesce(sum(u.total_tokens), 0)::bigint AS tokens
    FROM usage_events u
    LEFT JOIN model_catalog m ON m.id = u.model_id
    WHERE u.org_id = ${orgId} AND u.at > now() - (${days}::int * interval '1 day')
    GROUP BY 1, 2 ORDER BY requests DESC LIMIT 8
  `
  return rows.map((row) => ({ key: row.key, label: row.label, requests: Number(row.requests), tokens: Number(row.tokens) }))
}

export async function usageByUser(sql: Sql, orgId: string, days: number): Promise<UsageBreakdown[]> {
  const rows = await sql<{ key: string; label: string; requests: number; tokens: string }[]>`
    SELECT u.user_id AS key, coalesce(users.email, u.user_id) AS label,
           count(*)::int AS requests, coalesce(sum(u.total_tokens), 0)::bigint AS tokens
    FROM usage_events u
    LEFT JOIN users ON users.id = u.user_id
    WHERE u.org_id = ${orgId} AND u.at > now() - (${days}::int * interval '1 day')
    GROUP BY 1, 2 ORDER BY requests DESC LIMIT 8
  `
  return rows.map((row) => ({ key: row.key, label: row.label, requests: Number(row.requests), tokens: Number(row.tokens) }))
}

export async function members(sql: Sql, orgId: string, query: string | undefined) {
  const pattern = query ? `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : null
  return sql<ConsoleMember[]>`
    SELECT users.id, users.email, users.name, memberships.role, memberships.created_at
    FROM memberships JOIN users ON users.id = memberships.user_id
    WHERE memberships.org_id = ${orgId}
      ${pattern ? sql`AND (users.email ILIKE ${pattern} OR users.name ILIKE ${pattern})` : sql``}
    ORDER BY
      CASE memberships.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      users.email
    LIMIT 200
  `
}

export async function ownerCount(sql: Sql, orgId: string) {
  const rows = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM memberships WHERE org_id = ${orgId} AND role = 'owner'
  `
  return Number(rows[0]?.count ?? 0)
}

export async function updateMemberRole(sql: Sql, orgId: string, userId: string, role: Role) {
  const rows = await sql<{ user_id: string }[]>`
    UPDATE memberships SET role = ${role}
    WHERE org_id = ${orgId} AND user_id = ${userId}
    RETURNING user_id
  `
  return rows.length > 0
}

export async function catalogForOrg(sql: Sql, orgId: string) {
  return sql<CatalogModel[]>`
    SELECT m.id, m.name, m.upstream_model, m.context_limit, m.output_limit, m.enabled,
           coalesce(om.enabled, false) AS org_enabled
    FROM model_catalog m
    LEFT JOIN org_models om ON om.model_id = m.id AND om.org_id = ${orgId}
    ORDER BY m.name
  `
}

export async function orgModelIds(sql: Sql, orgId: string) {
  const rows = await sql<{ model_id: string }[]>`
    SELECT model_id FROM org_models WHERE org_id = ${orgId} AND enabled
  `
  return rows.map((row) => row.model_id)
}

export async function modelIdsExist(sql: Sql, ids: readonly string[]) {
  if (ids.length === 0) return []
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM model_catalog WHERE id IN ${sql(ids as string[])}
  `
  return rows.map((row) => row.id)
}

export async function orgPolicies(sql: Sql, orgId: string) {
  const rows = await sql<{ statements: unknown }[]>`
    SELECT statements FROM org_policies WHERE org_id = ${orgId} LIMIT 1
  `
  return rows[0]?.statements
}

export async function orgSso(sql: Sql, orgId: string) {
  const rows = await sql<
    {
      issuer: string
      client_id: string
      scopes: string
      allowed_domains: string[]
      group_claim: string | null
      group_roles: Record<string, string>
      enabled: boolean
      has_secret: boolean
      updated_at: string
    }[]
  >`
    SELECT issuer, client_id, scopes, allowed_domains, group_claim, group_roles, enabled,
           (encrypted_client_secret <> '') AS has_secret, updated_at
    FROM sso_connections WHERE org_id = ${orgId} LIMIT 1
  `
  return rows[0]
}

export async function orgUpstream(sql: Sql, orgId: string) {
  const rows = await sql<{ upstream_base_url: string | null; has_api_key: boolean }[]>`
    SELECT upstream_base_url, (encrypted_upstream_api_key IS NOT NULL AND encrypted_upstream_api_key <> '') AS has_api_key
    FROM org_settings WHERE org_id = ${orgId} LIMIT 1
  `
  return rows[0]
}

export async function orgSessions(sql: Sql, orgId: string, limit = 100) {
  return sql<ConsoleSession[]>`
    SELECT s.id, s.user_id, u.email, u.name, m.role, s.auth_method, s.user_agent,
           host(s.ip) AS ip, s.created_at, s.last_seen_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN memberships m ON m.user_id = s.user_id AND m.org_id = s.org_id
    WHERE s.org_id = ${orgId} AND s.revoked_at IS NULL AND s.last_seen_at > now() - interval '30 days'
    ORDER BY s.last_seen_at DESC
    LIMIT ${limit}
  `
}

export async function userSessions(sql: Sql, orgId: string, userId: string) {
  return sql<ConsoleSession[]>`
    SELECT s.id, s.user_id, u.email, u.name, m.role, s.auth_method, s.user_agent,
           host(s.ip) AS ip, s.created_at, s.last_seen_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN memberships m ON m.user_id = s.user_id AND m.org_id = s.org_id
    WHERE s.org_id = ${orgId} AND s.user_id = ${userId} AND s.revoked_at IS NULL
    ORDER BY s.last_seen_at DESC
    LIMIT 50
  `
}

export async function sessionOwner(sql: Sql, sessionId: string) {
  const rows = await sql<{ id: string; org_id: string; user_id: string }[]>`
    SELECT id, org_id, user_id FROM sessions WHERE id = ${sessionId} LIMIT 1
  `
  return rows[0]
}

export async function auditFeed(
  sql: Sql,
  orgId: string,
  input: { limit: number; before?: { at: string; id: string }; kind?: string },
) {
  return sql<AuditEvent[]>`
    SELECT a.id::text AS id, a.at, a.kind, a.user_id, u.email, a.detail
    FROM audit_events a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.org_id = ${orgId}
      ${input.before ? sql`AND (a.at, a.id) < (${input.before.at}::timestamptz, ${input.before.id}::bigint)` : sql``}
      ${input.kind ? sql`AND a.kind = ${input.kind}` : sql``}
    ORDER BY a.at DESC, a.id DESC
    LIMIT ${input.limit}
  `
}

export async function auditKinds(sql: Sql, orgId: string) {
  const rows = await sql<{ kind: string; count: number }[]>`
    SELECT kind, count(*)::int AS count
    FROM audit_events
    WHERE org_id = ${orgId} AND at > now() - interval '30 days'
    GROUP BY kind ORDER BY count DESC LIMIT 30
  `
  return rows.map((row) => ({ kind: row.kind, count: Number(row.count) }))
}

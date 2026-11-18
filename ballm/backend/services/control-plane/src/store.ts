import { randomUUID } from "node:crypto"
import type { ControlPlaneEnv } from "@ballm/platform/env"
import type { Query, Sql } from "@ballm/platform/db"
import { randomToken, sha256 } from "@ballm/platform/auth"

export interface UserRow {
  id: string
  email: string
  name: string | null
}

export interface OrgRow {
  id: string
  slug: string
  name: string
}

export interface SessionRow {
  id: string
  user_id: string
  org_id: string
  auth_method: "device" | "sso" | "dev"
  revoked_at: Date | null
}

export interface DeviceRow {
  device_code_hash: string
  user_code: string
  status: "pending" | "approved" | "claimed" | "denied" | "expired"
  user_id: string | null
  org_id: string | null
  session_id: string | null
  interval_seconds: number
  last_polled_at: Date | null
  expires_at: Date
}

export interface OidcStateRow {
  state: string
  org_id: string
  nonce: string
  code_verifier: string
  redirect_uri: string
  device_code_hash: string | null
  user_code: string | null
  expires_at: Date
}

export interface ModelRow {
  id: string
  name: string
  upstream_model: string
  context_limit: number | null
  output_limit: number | null
}

export interface SsoRow {
  org_id: string
  issuer: string
  client_id: string
  encrypted_client_secret: string
  scopes: string
  allowed_domains: string[]
  group_claim: string | null
  group_roles: Record<string, string>
  enabled: boolean
}

const userCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function userCodeValue() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const code = Array.from(bytes, (byte) => userCodeAlphabet.charAt(byte % userCodeAlphabet.length)).join("")
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

export function deviceHash(value: string) {
  return sha256(value)
}

export async function findOrCreateUser(sql: Sql, input: { email: string; name?: string }) {
  const email = input.email.trim()
  const existing = await sql<UserRow[]>`
    SELECT id, email, name FROM users WHERE lower(email) = lower(${email}) LIMIT 1
  `
  if (existing[0]) {
    if (input.name && !existing[0].name) {
      await sql`UPDATE users SET name = ${input.name}, updated_at = now() WHERE id = ${existing[0].id}`
      existing[0].name = input.name
    }
    return existing[0]
  }

  const user = { id: `usr_${randomUUID()}`, email, name: input.name ?? null }
  await sql`INSERT INTO users (id, email, name) VALUES (${user.id}, ${user.email}, ${user.name})`
  return user
}

export async function ensureOrg(sql: Sql, input: { id?: string; slug: string; name: string }) {
  const existing = await sql<OrgRow[]>`
    SELECT id, slug, name FROM orgs WHERE slug = ${input.slug} OR id = ${input.id ?? input.slug} LIMIT 1
  `
  if (existing[0]) return existing[0]
  const org = { id: input.id ?? `org_${randomUUID()}`, slug: input.slug, name: input.name }
  await sql`INSERT INTO orgs (id, slug, name) VALUES (${org.id}, ${org.slug}, ${org.name})`
  return org
}

export async function orgById(sql: Sql, id: string) {
  const rows = await sql<OrgRow[]>`SELECT id, slug, name FROM orgs WHERE id = ${id} LIMIT 1`
  return rows[0]
}

export async function orgBySlug(sql: Sql, slug: string) {
  const rows = await sql<OrgRow[]>`SELECT id, slug, name FROM orgs WHERE slug = ${slug} LIMIT 1`
  return rows[0]
}

export async function membership(sql: Sql, userId: string, orgId: string) {
  const rows = await sql<{ role: string }[]>`
    SELECT role FROM memberships WHERE user_id = ${userId} AND org_id = ${orgId} LIMIT 1
  `
  return rows[0]
}

/**
 * Adds a membership, or updates its role when one is supplied. An undefined role preserves an
 * existing role, which keeps manually promoted owners from being demoted on every SSO login when
 * the organization has no group mapping.
 */
export async function ensureMembership(sql: Sql, userId: string, orgId: string, role?: string) {
  await sql`
    INSERT INTO memberships (user_id, org_id, role)
    VALUES (${userId}, ${orgId}, ${role ?? "member"})
    ON CONFLICT (user_id, org_id) DO UPDATE SET
      role = CASE WHEN ${role === undefined} THEN memberships.role ELSE EXCLUDED.role END
  `
}

export async function orgsForUser(sql: Sql, userId: string) {
  return sql<OrgRow[]>`
    SELECT orgs.id, orgs.slug, orgs.name
    FROM orgs
    JOIN memberships ON memberships.org_id = orgs.id
    WHERE memberships.user_id = ${userId}
    ORDER BY orgs.name
  `
}

export async function createSession(
  sql: Sql,
  input: {
    userId: string
    orgId: string
    method: "device" | "sso" | "dev"
    userAgent?: string
    ip?: string
  },
) {
  const id = `ses_${randomUUID()}`
  await sql`
    INSERT INTO sessions (id, user_id, org_id, auth_method, user_agent, ip)
    VALUES (${id}, ${input.userId}, ${input.orgId}, ${input.method}, ${input.userAgent ?? null}, ${input.ip ?? null}::inet)
  `
  return id
}

export async function sessionById(sql: Sql, id: string) {
  const rows = await sql<SessionRow[]>`
    SELECT id, user_id, org_id, auth_method, revoked_at FROM sessions WHERE id = ${id} LIMIT 1
  `
  return rows[0]
}

export async function revokeSession(sql: Sql, sessionId: string) {
  await sql.begin(async (tx) => {
    await tx`UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId} AND revoked_at IS NULL`
    await tx`UPDATE refresh_tokens SET revoked_at = now() WHERE session_id = ${sessionId} AND revoked_at IS NULL`
  })
}

/** Revokes every active session for a user, optionally scoped to one organization. */
export async function revokeUserSessions(sql: Sql, userId: string, orgId?: string) {
  const rows = orgId
    ? await sql<{ id: string }[]>`
        UPDATE sessions SET revoked_at = now()
        WHERE user_id = ${userId} AND org_id = ${orgId} AND revoked_at IS NULL
        RETURNING id
      `
    : await sql<{ id: string }[]>`
        UPDATE sessions SET revoked_at = now()
        WHERE user_id = ${userId} AND revoked_at IS NULL
        RETURNING id
      `
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  await sql`UPDATE refresh_tokens SET revoked_at = now() WHERE session_id IN ${sql(ids)} AND revoked_at IS NULL`
  return ids
}

export async function createRefreshToken(
  sql: Query,
  input: { sessionId: string; familyId?: string; ttlSeconds: number },
) {
  const raw = randomToken(32)
  const familyId = input.familyId ?? `fam_${randomUUID()}`
  await sql`
    INSERT INTO refresh_tokens (id, session_id, token_hash, family_id, expires_at)
    VALUES (${`rt_${randomUUID()}`}, ${input.sessionId}, ${sha256(raw)}, ${familyId}, now() + ${input.ttlSeconds} * interval '1 second')
  `
  return { token: raw, familyId }
}

export async function rotateRefreshToken(
  sql: Sql,
  raw: string,
  ttlSeconds: number,
): Promise<
  | { kind: "invalid" }
  | { kind: "reused"; sessionId: string }
  | { kind: "ok"; refresh: string; sessionId: string; userId: string; orgId: string }
> {
  return sql.begin(async (tx) => {
    const rows = await tx<
      {
        id: string
        session_id: string
        family_id: string
        expires_at: Date
        rotated_at: Date | null
        revoked_at: Date | null
        user_id: string
        org_id: string
        session_revoked_at: Date | null
      }[]
    >`
      SELECT
        rt.id, rt.session_id, rt.family_id, rt.expires_at, rt.rotated_at, rt.revoked_at,
        s.user_id, s.org_id, s.revoked_at AS session_revoked_at
      FROM refresh_tokens rt
      JOIN sessions s ON s.id = rt.session_id
      WHERE rt.token_hash = ${sha256(raw)}
      FOR UPDATE OF rt
    `
    const row = rows[0]
    if (!row) return { kind: "invalid" as const }
    if (row.revoked_at || row.session_revoked_at || row.expires_at.getTime() <= Date.now())
      return { kind: "invalid" as const }

    if (row.rotated_at) {
      await tx`UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = ${row.family_id} AND revoked_at IS NULL`
      await tx`UPDATE sessions SET revoked_at = now() WHERE id = ${row.session_id}`
      return { kind: "reused" as const, sessionId: row.session_id }
    }

    const next = randomToken(32)
    await tx`UPDATE refresh_tokens SET rotated_at = now() WHERE id = ${row.id}`
    await tx`
      INSERT INTO refresh_tokens (id, session_id, token_hash, family_id, expires_at)
      VALUES (${`rt_${randomUUID()}`}, ${row.session_id}, ${sha256(next)}, ${row.family_id}, now() + ${ttlSeconds} * interval '1 second')
    `
    await tx`UPDATE sessions SET last_seen_at = now() WHERE id = ${row.session_id}`
    return {
      kind: "ok" as const,
      refresh: next,
      sessionId: row.session_id,
      userId: row.user_id,
      orgId: row.org_id,
    }
  })
}

export async function revokeRefreshToken(sql: Sql, raw: string) {
  const rows = await sql<{ session_id: string }[]>`
    SELECT session_id FROM refresh_tokens WHERE token_hash = ${sha256(raw)} LIMIT 1
  `
  if (!rows[0]) return undefined
  await revokeSession(sql, rows[0].session_id)
  return rows[0].session_id
}

export async function createDeviceCode(sql: Sql, clientId: string) {
  const deviceCode = randomToken(32)
  const userCode = userCodeValue()
  await sql`
    INSERT INTO device_codes (device_code_hash, user_code, client_id, interval_seconds, expires_at)
    VALUES (${deviceHash(deviceCode)}, ${userCode}, ${clientId}, 5, now() + interval '10 minutes')
  `
  return { deviceCode, userCode, expiresIn: 600, interval: 5 }
}

export async function deviceByUserCode(sql: Sql, userCode: string) {
  const rows = await sql<DeviceRow[]>`
    SELECT device_code_hash, user_code, status, user_id, org_id, session_id,
           interval_seconds, last_polled_at, expires_at
    FROM device_codes WHERE user_code = ${userCode.trim().toUpperCase()} LIMIT 1
  `
  return rows[0]
}

export async function approveDeviceCode(
  sql: Sql,
  input: { deviceHash: string; userId: string; orgId: string; sessionId: string },
) {
  await sql`
    UPDATE device_codes
    SET status = 'approved', user_id = ${input.userId}, org_id = ${input.orgId},
        session_id = ${input.sessionId}, approved_at = now()
    WHERE device_code_hash = ${input.deviceHash} AND status = 'pending' AND expires_at > now()
  `
}

export async function claimDeviceCode(
  sql: Sql,
  raw: string,
  refreshTtl: number,
): Promise<
  | { status: "authorization_pending" | "slow_down" | "expired_token" | "access_denied" }
  | {
      status: "approved"
      userId: string
      orgId: string
      sessionId: string
      refresh: string
    }
> {
  return sql.begin(async (tx) => {
    const rows = await tx<DeviceRow[]>`
      SELECT device_code_hash, user_code, status, user_id, org_id, session_id,
             interval_seconds, last_polled_at, expires_at
      FROM device_codes WHERE device_code_hash = ${deviceHash(raw)} FOR UPDATE
    `
    const row = rows[0]
    if (!row) return { status: "expired_token" as const }
    if (row.expires_at.getTime() <= Date.now()) return { status: "expired_token" as const }
    if (row.status === "pending") {
      if (row.last_polled_at && Date.now() - row.last_polled_at.getTime() < row.interval_seconds * 1000)
        return { status: "slow_down" as const }
      await tx`UPDATE device_codes SET last_polled_at = now() WHERE device_code_hash = ${row.device_code_hash}`
      return { status: "authorization_pending" as const }
    }
    if (row.status === "denied") return { status: "access_denied" as const }
    if (row.status === "claimed" || !row.user_id || !row.org_id || !row.session_id)
      return { status: "expired_token" as const }

    const refresh = await createRefreshToken(tx, { sessionId: row.session_id, ttlSeconds: refreshTtl })
    await tx`UPDATE device_codes SET status = 'claimed' WHERE device_code_hash = ${row.device_code_hash}`
    return {
      status: "approved" as const,
      userId: row.user_id,
      orgId: row.org_id,
      sessionId: row.session_id,
      refresh: refresh.token,
    }
  })
}

export async function createBrowserSession(
  sql: Sql,
  input: { userId: string; orgId: string; ttlSeconds: number },
) {
  const id = `brw_${randomUUID()}`
  const token = randomToken(32)
  await sql`
    INSERT INTO browser_sessions (id, user_id, org_id, token_hash, expires_at)
    VALUES (${id}, ${input.userId}, ${input.orgId}, ${sha256(token)}, now() + ${input.ttlSeconds} * interval '1 second')
  `
  return { id, token, cookie: `${id}.${token}` }
}

export async function browserSession(sql: Sql, cookie: string | undefined) {
  if (!cookie) return undefined
  const separator = cookie.indexOf(".")
  if (separator === -1) return undefined
  const id = cookie.slice(0, separator)
  const token = cookie.slice(separator + 1)
  const rows = await sql<{ id: string; user_id: string; org_id: string; expires_at: Date; revoked_at: Date | null }[]>`
    SELECT id, user_id, org_id, expires_at, revoked_at
    FROM browser_sessions
    WHERE id = ${id} AND token_hash = ${sha256(token)} AND revoked_at IS NULL
    LIMIT 1
  `
  const row = rows[0]
  if (!row || row.expires_at.getTime() <= Date.now()) return undefined
  return row
}

export async function revokeBrowserSession(sql: Sql, cookie: string | undefined) {
  const parsed = await browserSession(sql, cookie)
  if (!parsed) return
  await sql`UPDATE browser_sessions SET revoked_at = now() WHERE id = ${parsed.id}`
}

export async function createOidcState(
  sql: Sql,
  input: {
    orgId: string
    nonce: string
    codeVerifier: string
    redirectUri: string
    deviceCodeHash?: string
    userCode?: string
  },
) {
  const state = randomToken(32)
  await sql`
    INSERT INTO oidc_states (state, org_id, nonce, code_verifier, redirect_uri, device_code_hash, user_code, expires_at)
    VALUES (${state}, ${input.orgId}, ${input.nonce}, ${input.codeVerifier}, ${input.redirectUri},
            ${input.deviceCodeHash ?? null}, ${input.userCode ?? null}, now() + interval '10 minutes')
  `
  return state
}

export async function consumeOidcState(sql: Sql, state: string) {
  const rows = await sql<OidcStateRow[]>`
    DELETE FROM oidc_states
    WHERE state = ${state} AND expires_at > now()
    RETURNING state, org_id, nonce, code_verifier, redirect_uri, device_code_hash, user_code, expires_at
  `
  return rows[0]
}

export async function ssoForOrg(sql: Sql, orgId: string) {
  const rows = await sql<SsoRow[]>`
    SELECT org_id, issuer, client_id, encrypted_client_secret, scopes, allowed_domains,
           group_claim, group_roles, enabled
    FROM sso_connections WHERE org_id = ${orgId} LIMIT 1
  `
  return rows[0]
}

export async function orgForEmailDomain(sql: Sql, domain: string) {
  const rows = await sql<(OrgRow & { issuer: string; allowed_domains: string[] })[]>`
    SELECT orgs.id, orgs.slug, orgs.name, sso.issuer, sso.allowed_domains
    FROM orgs
    JOIN sso_connections sso ON sso.org_id = orgs.id
    WHERE sso.enabled AND ${domain} = ANY(sso.allowed_domains)
    ORDER BY orgs.name
  `
  return rows
}

export async function getOrgConfig(sql: Sql, orgId: string) {
  const [models, policies, settings] = await Promise.all([
    sql<ModelRow[]>`
      SELECT m.id, m.name, m.upstream_model, m.context_limit, m.output_limit
      FROM org_models om
      JOIN model_catalog m ON m.id = om.model_id
      WHERE om.org_id = ${orgId} AND om.enabled AND m.enabled
      ORDER BY m.name
    `,
    sql<{ statements: unknown }[]>`SELECT statements FROM org_policies WHERE org_id = ${orgId} LIMIT 1`,
    sql<{ upstream_base_url: string | null; encrypted_upstream_api_key: string | null }[]>`
      SELECT upstream_base_url, encrypted_upstream_api_key FROM org_settings WHERE org_id = ${orgId} LIMIT 1
    `,
  ])
  return {
    models,
    policies: policies[0]?.statements ?? undefined,
    upstreamBaseUrl: settings[0]?.upstream_base_url ?? undefined,
    encryptedUpstreamApiKey: settings[0]?.encrypted_upstream_api_key ?? undefined,
  }
}

export async function listOrgs(sql: Sql) {
  return sql<(OrgRow & { user_count: number })[]>`
    SELECT orgs.id, orgs.slug, orgs.name, count(memberships.user_id)::int AS user_count
    FROM orgs LEFT JOIN memberships ON memberships.org_id = orgs.id
    GROUP BY orgs.id ORDER BY orgs.name
  `
}

export async function createOrg(sql: Sql, input: { id?: string; slug: string; name: string }) {
  const id = input.id ?? `org_${randomUUID()}`
  const rows = await sql<OrgRow[]>`
    INSERT INTO orgs (id, slug, name) VALUES (${id}, ${input.slug}, ${input.name})
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, slug, name
  `
  return rows[0]!
}

export async function listOrgUsers(sql: Sql, orgId: string) {
  return sql<{ id: string; email: string; name: string | null; role: string; created_at: Date }[]>`
    SELECT users.id, users.email, users.name, memberships.role, memberships.created_at
    FROM memberships JOIN users ON users.id = memberships.user_id
    WHERE memberships.org_id = ${orgId}
    ORDER BY users.email
  `
}

export async function addOrgMember(sql: Sql, input: { orgId: string; email: string; role: string }) {
  const user = await findOrCreateUser(sql, { email: input.email })
  await ensureMembership(sql, user.id, input.orgId, input.role)
  return user
}

export async function removeOrgMember(sql: Sql, orgId: string, userId: string) {
  await sql`DELETE FROM memberships WHERE org_id = ${orgId} AND user_id = ${userId}`
}

export async function listModels(sql: Sql) {
  return sql<ModelRow[]>`
    SELECT id, name, upstream_model, context_limit, output_limit FROM model_catalog ORDER BY id
  `
}

export async function upsertModel(
  sql: Sql,
  input: {
    id: string
    name: string
    upstreamModel: string
    contextLimit?: number
    outputLimit?: number
    enabled?: boolean
  },
) {
  const rows = await sql<ModelRow[]>`
    INSERT INTO model_catalog (id, name, upstream_model, context_limit, output_limit, enabled)
    VALUES (${input.id}, ${input.name}, ${input.upstreamModel}, ${input.contextLimit ?? null}, ${input.outputLimit ?? null}, ${input.enabled ?? true})
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, upstream_model = EXCLUDED.upstream_model,
      context_limit = EXCLUDED.context_limit, output_limit = EXCLUDED.output_limit,
      enabled = EXCLUDED.enabled, updated_at = now()
    RETURNING id, name, upstream_model, context_limit, output_limit
  `
  return rows[0]!
}

export async function setOrgModels(sql: Sql, orgId: string, modelIds: readonly string[]) {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM org_models WHERE org_id = ${orgId}`
    for (const modelId of modelIds) {
      await tx`INSERT INTO org_models (org_id, model_id) VALUES (${orgId}, ${modelId}) ON CONFLICT DO NOTHING`
    }
  })
}

export async function setPolicies(sql: Sql, orgId: string, statements: unknown) {
  await sql`
    INSERT INTO org_policies (org_id, statements) VALUES (${orgId}, ${sql.json(statements as never)})
    ON CONFLICT (org_id) DO UPDATE SET statements = EXCLUDED.statements, updated_at = now()
  `
}

export async function setSso(
  sql: Sql,
  input: {
    orgId: string
    issuer: string
    clientId: string
    encryptedClientSecret: string
    scopes: string
    allowedDomains: readonly string[]
    groupClaim?: string
    groupRoles?: Record<string, string>
    enabled?: boolean
  },
) {
  await sql`
    INSERT INTO sso_connections
      (org_id, issuer, client_id, encrypted_client_secret, scopes, allowed_domains, group_claim, group_roles, enabled)
    VALUES
      (${input.orgId}, ${input.issuer}, ${input.clientId}, ${input.encryptedClientSecret}, ${input.scopes},
       ${sql.array(input.allowedDomains as string[])}, ${input.groupClaim ?? null},
       ${sql.json((input.groupRoles ?? {}) as never)}, ${input.enabled ?? true})
    ON CONFLICT (org_id) DO UPDATE SET
      issuer = EXCLUDED.issuer, client_id = EXCLUDED.client_id,
      encrypted_client_secret = EXCLUDED.encrypted_client_secret,
      scopes = EXCLUDED.scopes, allowed_domains = EXCLUDED.allowed_domains,
      group_claim = EXCLUDED.group_claim, group_roles = EXCLUDED.group_roles,
      enabled = EXCLUDED.enabled, updated_at = now()
  `
}

export async function setOrgSettings(
  sql: Sql,
  input: {
    orgId: string
    upstreamBaseUrl?: string | null
    encryptedUpstreamApiKey?: string | null
  },
) {
  await sql`
    INSERT INTO org_settings (org_id, upstream_base_url, encrypted_upstream_api_key)
    VALUES (${input.orgId}, ${input.upstreamBaseUrl ?? null}, ${input.encryptedUpstreamApiKey ?? null})
    ON CONFLICT (org_id) DO UPDATE SET
      upstream_base_url = CASE
        WHEN ${input.upstreamBaseUrl === null} THEN NULL
        ELSE COALESCE(EXCLUDED.upstream_base_url, org_settings.upstream_base_url)
      END,
      encrypted_upstream_api_key = CASE
        WHEN ${input.encryptedUpstreamApiKey === null} THEN NULL
        ELSE COALESCE(EXCLUDED.encrypted_upstream_api_key, org_settings.encrypted_upstream_api_key)
      END,
      updated_at = now()
  `
}

export async function audit(
  sql: Sql,
  event: {
    kind: string
    orgId?: string
    userId?: string
    sessionId?: string
    detail?: unknown
  },
) {
  await sql`
    INSERT INTO audit_events (org_id, user_id, session_id, kind, detail)
    VALUES (${event.orgId ?? null}, ${event.userId ?? null}, ${event.sessionId ?? null}, ${event.kind},
            ${event.detail === undefined ? null : sql.json(event.detail as never)})
  `
}

export async function cleanupExpired(sql: Sql) {
  await sql`DELETE FROM device_codes WHERE expires_at < now() - interval '1 day'`
  await sql`DELETE FROM oidc_states WHERE expires_at < now() - interval '1 day'`
  await sql`DELETE FROM refresh_tokens WHERE expires_at < now() - interval '30 days'`
  await sql`DELETE FROM browser_sessions WHERE expires_at < now() - interval '1 day'`
}

export async function ensureBootstrap(sql: Sql, config: ControlPlaneEnv, secrets: import("@ballm/platform/secrets").SecretBox) {
  const org = await ensureOrg(sql, {
    id: config.BALLM_BOOTSTRAP_ORG_ID,
    slug: config.BALLM_BOOTSTRAP_ORG_SLUG,
    name: config.BALLM_BOOTSTRAP_ORG_NAME,
  })
  const user = await findOrCreateUser(sql, { email: config.BALLM_BOOTSTRAP_ADMIN_EMAIL })
  await ensureMembership(sql, user.id, org.id, "owner")

  for (const entry of parseModels(config.BALLM_BOOTSTRAP_MODELS)) {
    const model = await upsertModel(sql, { id: entry.id, name: entry.name, upstreamModel: entry.id })
    await sql`
      INSERT INTO org_models (org_id, model_id) VALUES (${org.id}, ${model.id})
      ON CONFLICT DO NOTHING
    `
  }

  const policies = await sql<{ statements: unknown }[]>`
    SELECT statements FROM org_policies WHERE org_id = ${org.id} LIMIT 1
  `
  if (!policies[0]) await setPolicies(sql, org.id, defaultPolicies())

  if (config.BALLM_BOOTSTRAP_SSO_ISSUER && config.BALLM_BOOTSTRAP_SSO_CLIENT_ID && config.BALLM_BOOTSTRAP_SSO_CLIENT_SECRET) {
    await setSso(sql, {
      orgId: org.id,
      issuer: config.BALLM_BOOTSTRAP_SSO_ISSUER,
      clientId: config.BALLM_BOOTSTRAP_SSO_CLIENT_ID,
      encryptedClientSecret: secrets.seal(config.BALLM_BOOTSTRAP_SSO_CLIENT_SECRET),
      scopes: "openid email profile",
      allowedDomains: config.BALLM_BOOTSTRAP_SSO_ALLOWED_DOMAINS.split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    })
  }

  return org
}

export function defaultPolicies() {
  return [
    { action: "provider.use", resource: "*", effect: "deny" },
    { action: "provider.use", resource: "ballm", effect: "allow" },
    { action: "integration.connect", resource: "*", effect: "deny" },
    { action: "integration.connect", resource: "ballm", effect: "allow" },
    { action: "integration.use", resource: "*", effect: "deny" },
    { action: "integration.use", resource: "ballm*", effect: "allow" },
    { action: "mcp.use", resource: "*", effect: "deny" },
    { action: "mcp.use", resource: "ballm-*", effect: "allow" },
    { action: "websearch.use", resource: "*", effect: "deny" },
    { action: "plugin.use", resource: "*", effect: "deny" },
  ]
}

function parseModels(input: string) {
  return input
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":")
      if (separator === -1) return { id: entry, name: entry }
      return { id: entry.slice(0, separator).trim(), name: entry.slice(separator + 1).trim() }
    })
}

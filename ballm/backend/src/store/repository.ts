import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { ServerConfig } from "../env.js"
import type { DB } from "./db.js"

export interface UserRow {
  id: string
  email: string
}

export interface OrgRow {
  id: string
  name: string
}

export interface DeviceRow {
  device_code: string
  user_code: string
  status: string
  user_id: string | null
  org_id: string | null
  expires_at: number
}

export interface TokenRow {
  id: string
  user_id: string
  org_id: string
  access_expires_at: number
  refresh_expires_at: number
  revoked_at: number | null
}

export interface Issued {
  access: string
  refresh: string
  expiresIn: number
}

export function findOrCreateUser(db: DB, email: string) {
  const existing = db.query<UserRow, [string]>("SELECT id, email FROM users WHERE email = ?").get(email)
  if (existing) return existing
  const id = `usr_${randomUUID()}`
  db.query("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").run(id, email, Date.now())
  return { id, email }
}

export function ensureOrg(db: DB, id: string, name: string) {
  const existing = db.query<OrgRow, [string]>("SELECT id, name FROM orgs WHERE id = ?").get(id)
  if (existing) return existing
  db.query("INSERT INTO orgs (id, name, created_at) VALUES (?, ?, ?)").run(id, name, Date.now())
  return { id, name }
}

export function addMembership(db: DB, userID: string, orgID: string) {
  db.query("INSERT OR IGNORE INTO memberships (user_id, org_id, role, created_at) VALUES (?, ?, 'member', ?)").run(
    userID,
    orgID,
    Date.now(),
  )
}

export function orgsForUser(db: DB, userID: string) {
  return db
    .query<
      OrgRow,
      [string]
    >("SELECT orgs.id, orgs.name FROM orgs JOIN memberships ON memberships.org_id = orgs.id WHERE memberships.user_id = ? ORDER BY orgs.name")
    .all(userID)
}

export function createDeviceCode(db: DB, clientID: string) {
  const deviceCode = randomToken(32)
  const userCode = userCodeValue()
  const now = Date.now()
  db.query(
    "INSERT INTO device_codes (device_code, user_code, client_id, status, interval, expires_at, created_at) VALUES (?, ?, ?, 'pending', 5, ?, ?)",
  ).run(deviceCode, userCode, clientID, now + 10 * 60 * 1000, now)
  return { deviceCode, userCode, expiresIn: 600, interval: 5 }
}

export function approveDeviceCode(db: DB, userCode: string, email: string, config: ServerConfig) {
  const device = db
    .query<
      DeviceRow,
      [string]
    >("SELECT device_code, user_code, status, user_id, org_id, expires_at FROM device_codes WHERE user_code = ?")
    .get(userCode.trim().toUpperCase())
  if (!device) return { ok: false as const, error: "unknown_code" }
  if (device.expires_at < Date.now()) return { ok: false as const, error: "expired_token" }
  const user = findOrCreateUser(db, email)
  const org = ensureOrg(db, config.orgID, config.orgName)
  addMembership(db, user.id, org.id)
  db.query("UPDATE device_codes SET status = 'approved', user_id = ?, org_id = ? WHERE device_code = ?").run(
    user.id,
    org.id,
    device.device_code,
  )
  audit(db, { kind: "device.approved", userId: user.id, orgId: org.id, detail: user.email })
  return { ok: true as const, email: user.email, org: org.name }
}

export function claimDeviceCode(db: DB, deviceCode: string) {
  const device = db
    .query<
      DeviceRow,
      [string]
    >("SELECT device_code, user_code, status, user_id, org_id, expires_at FROM device_codes WHERE device_code = ?")
    .get(deviceCode)
  if (!device) return { status: "expired_token" as const }
  if (device.expires_at < Date.now()) return { status: "expired_token" as const }
  if (device.status !== "approved" || !device.user_id || !device.org_id)
    return { status: "authorization_pending" as const }
  db.query("DELETE FROM device_codes WHERE device_code = ?").run(deviceCode)
  return { status: "approved" as const, userID: device.user_id, orgID: device.org_id }
}

export function issueTokens(db: DB, userID: string, orgID: string, config: ServerConfig): Issued {
  const access = randomToken(32)
  const refresh = randomToken(32)
  const now = Date.now()
  db.query(
    "INSERT INTO tokens (id, access_hash, refresh_hash, user_id, org_id, access_expires_at, refresh_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    `tok_${randomUUID()}`,
    hash(access),
    hash(refresh),
    userID,
    orgID,
    now + config.accessTtl * 1000,
    now + config.refreshTtl * 1000,
    now,
  )
  return { access, refresh, expiresIn: config.accessTtl }
}

export function rotateRefreshToken(db: DB, refresh: string, config: ServerConfig) {
  const row = findToken(db, "refresh_hash", refresh)
  if (!row || row.revoked_at !== null || row.refresh_expires_at < Date.now()) return undefined
  const access = randomToken(32)
  const nextRefresh = randomToken(32)
  const now = Date.now()
  db.query(
    "UPDATE tokens SET access_hash = ?, refresh_hash = ?, access_expires_at = ?, refresh_expires_at = ? WHERE id = ?",
  ).run(hash(access), hash(nextRefresh), now + config.accessTtl * 1000, now + config.refreshTtl * 1000, row.id)
  return { access, refresh: nextRefresh, expiresIn: config.accessTtl, userID: row.user_id, orgID: row.org_id }
}

export function accessToken(db: DB, access: string) {
  const row = findToken(db, "access_hash", access)
  if (!row || row.revoked_at !== null || row.access_expires_at < Date.now()) return undefined
  return row
}

export function revokeToken(db: DB, token: string) {
  db.query("UPDATE tokens SET revoked_at = ? WHERE (access_hash = ? OR refresh_hash = ?) AND revoked_at IS NULL").run(
    Date.now(),
    hash(token),
    hash(token),
  )
}

export function audit(db: DB, input: { kind: string; userId?: string; orgId?: string; detail?: string }) {
  db.query("INSERT INTO audit (id, at, kind, user_id, org_id, detail) VALUES (?, ?, ?, ?, ?, ?)").run(
    `aud_${randomUUID()}`,
    Date.now(),
    input.kind,
    input.userId ?? null,
    input.orgId ?? null,
    input.detail ?? null,
  )
}

function findToken(db: DB, column: "access_hash" | "refresh_hash", value: string) {
  const field = column === "access_hash" ? "access_hash" : "refresh_hash"
  return db
    .query<
      TokenRow,
      [string]
    >(`SELECT id, user_id, org_id, access_expires_at, refresh_expires_at, revoked_at FROM tokens WHERE ${field} = ?`)
    .get(hash(value))
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function randomToken(bytes: number) {
  return randomBytes(bytes).toString("base64url")
}

function userCodeValue() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = randomBytes(8)
  const code = Array.from(bytes, (byte) => alphabet.charAt(byte % alphabet.length)).join("")
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

import { Database } from "bun:sqlite"

export type DB = Database

export function open(path: string) {
  const db = new Database(path, { create: true })
  migrate(db)
  return db
}

export function migrate(db: Database) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT NOT NULL REFERENCES users(id),
      org_id TEXT NOT NULL REFERENCES orgs(id),
      role TEXT NOT NULL DEFAULT 'member',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, org_id)
    );

    CREATE TABLE IF NOT EXISTS device_codes (
      device_code TEXT PRIMARY KEY,
      user_code TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      status TEXT NOT NULL,
      user_id TEXT,
      org_id TEXT,
      interval INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      access_hash TEXT NOT NULL UNIQUE,
      refresh_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id),
      org_id TEXT NOT NULL REFERENCES orgs(id),
      access_expires_at INTEGER NOT NULL,
      refresh_expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      user_id TEXT,
      org_id TEXT,
      detail TEXT
    );

    CREATE INDEX IF NOT EXISTS audit_at ON audit(at);
  `)
}

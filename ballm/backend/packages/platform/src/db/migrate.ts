import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type { Sql } from "./index"

/**
 * Forward-only SQL migrations. Each file runs once in a transaction and is recorded in
 * `_ballm_migrations`. Deployments should run this as a Job before rolling new replicas.
 */
export async function migrate(sql: Sql, directory = migrationsDirectory()) {
  await sql`
    CREATE TABLE IF NOT EXISTS _ballm_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `

  const applied = new Set(
    (await sql<{ id: string }[]>`SELECT id FROM _ballm_migrations ORDER BY id`).map((row) => row.id),
  )

  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort()

  for (const file of files) {
    if (applied.has(file)) continue
    const body = readFileSync(path.join(directory, file), "utf8")
    await sql.begin(async (tx) => {
      await tx.unsafe(body)
      await tx`INSERT INTO _ballm_migrations (id) VALUES (${file})`
    })
    console.log(`applied migration ${file}`)
  }

  await ensurePartitions(sql)
}

/**
 * Creates the current and next two monthly partitions for append-only audit and usage tables.
 * The tables also have a DEFAULT partition, so a missed window never drops writes.
 */
export async function ensurePartitions(sql: Sql, now = new Date()) {
  for (const table of ["audit_events", "usage_events"] as const) {
    for (let offset = 0; offset <= 2; offset += 1) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
      const suffix = `${start.getUTCFullYear()}_${String(start.getUTCMonth() + 1).padStart(2, "0")}`
      try {
        await sql.unsafe(
          `CREATE TABLE IF NOT EXISTS ${table}_${suffix} PARTITION OF ${table} FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`,
        )
      } catch (error) {
        // A backfilled DEFAULT partition can overlap a late-created monthly partition. Keep serving;
        // an operator can move the overlapping rows and retry.
        console.warn(`could not create partition ${table}_${suffix}`, error)
      }
    }
  }
}

export function migrationsDirectory() {
  return process.env.BALLM_MIGRATIONS_DIR ?? path.resolve(import.meta.dir, "../../../../migrations")
}

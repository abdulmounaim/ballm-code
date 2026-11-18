import postgres from "postgres"

export type Sql = ReturnType<typeof postgres>
export type Query = Sql | postgres.TransactionSql

export interface Database {
  readonly write: Sql
  readonly read: Sql
  close(): Promise<void>
}

/**
 * Postgres connection pools. The control plane writes; both services can read through
 * DATABASE_READ_URL (a regional replica in multi-region deployments).
 *
 * `prepare: false` keeps the pool compatible with PgBouncer transaction pooling.
 */
export function createDatabase(input: {
  readonly url: string
  readonly readUrl?: string
  readonly max?: number
}): Database {
  const max = input.max ?? 20
  const options = {
    max,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => {},
  } as const

  const write = postgres(input.url, options)
  const read = input.readUrl && input.readUrl !== input.url ? postgres(input.readUrl, options) : write

  return {
    write,
    read,
    async close() {
      await write.end({ timeout: 5 })
      if (read !== write) await read.end({ timeout: 5 })
    },
  }
}

export async function ping(sql: Sql) {
  await sql`SELECT 1`
}

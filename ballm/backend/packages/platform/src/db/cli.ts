import { loadMigrationEnv } from "../env"
import { createDatabase } from "./index"
import { migrate } from "./migrate"

const env = loadMigrationEnv()
const db = createDatabase({
  url: env.DATABASE_URL,
  readUrl: env.DATABASE_READ_URL,
  max: env.BALLM_DB_POOL_MAX,
})

try {
  await migrate(db.write)
  console.log("migrations complete")
} finally {
  await db.close()
}

import { loadConfig } from "../env.js"
import { open } from "../store/db.js"
import { addMembership, ensureOrg, findOrCreateUser, issueTokens } from "../store/repository.js"

/**
 * Creates a local user, org membership, and token pair without running the device flow.
 * Useful for curl and gateway checks:
 *
 *   bun run src/dev/seed.ts | jq -r .access
 */
const config = loadConfig()
const db = open(config.db)
const user = findOrCreateUser(db, process.env.BALLM_SEED_EMAIL ?? "dev@ballm.internal")
const org = ensureOrg(db, config.orgID, config.orgName)
addMembership(db, user.id, org.id)
const tokens = issueTokens(db, user.id, org.id, config)

console.log(
  JSON.stringify(
    {
      user,
      org,
      access: tokens.access,
      refresh: tokens.refresh,
      expiresIn: tokens.expiresIn,
      config: `${config.publicUrl}/api/v2/config`,
    },
    null,
    2,
  ),
)

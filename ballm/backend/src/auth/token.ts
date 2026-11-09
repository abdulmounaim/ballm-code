import type { Context } from "hono"
import type { DB } from "../store/db.js"
import { accessToken } from "../store/repository.js"

/** Resolves the bearer token (or x-api-key) to an active session row. */
export function authenticate(c: Context, db: DB) {
  const header = c.req.header("authorization")
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1]
  const token = bearer ?? c.req.header("x-api-key")
  if (!token) return undefined
  return accessToken(db, token)
}

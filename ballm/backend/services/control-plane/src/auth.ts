import type { Context, MiddlewareHandler } from "hono"
import { constantTimeEqual } from "@ballm/platform/auth"
import { ApiError, bearer } from "@ballm/platform/http"
import type { Deps } from "./deps"
import { sessionById } from "./store"

export function accessAuth(deps: Deps): MiddlewareHandler {
  return async (c, next) => {
    const token = bearer(c)
    if (!token) throw new ApiError(401, "unauthorized", "Missing access token")

    let claims
    try {
      claims = await deps.keys.verify(token)
    } catch {
      throw new ApiError(401, "unauthorized", "Invalid or expired access token")
    }

    const revoked = await deps.cache.get(`ballm:revoked:${claims.sid}`)
    if (revoked) throw new ApiError(401, "unauthorized", "Session has been revoked")

    const session = await sessionById(deps.db.read, claims.sid)
    if (!session || session.revoked_at) throw new ApiError(401, "unauthorized", "Session has been revoked")

    c.set("claims", claims)
    await next()
  }
}

export function adminAuth(deps: Deps): MiddlewareHandler {
  return async (c, next) => {
    const token = bearer(c)
    if (!token || !deps.env.adminToken) throw new ApiError(401, "unauthorized", "Missing admin token")
    if (!constantTimeEqual(token, deps.env.adminToken)) throw new ApiError(401, "unauthorized", "Invalid admin token")
    await next()
  }
}

export function claims(c: Context<{ Variables: import("./deps").Variables }>) {
  return c.get("claims")
}

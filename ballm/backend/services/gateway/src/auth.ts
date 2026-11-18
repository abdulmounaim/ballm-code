import type { MiddlewareHandler } from "hono"
import { ApiError, bearer } from "@ballm/platform/http"
import type { GatewayDeps } from "./deps"

export function accessAuth(deps: GatewayDeps): MiddlewareHandler {
  return async (c, next) => {
    const token = bearer(c)
    if (!token) throw new ApiError(401, "authentication_error", "Missing access token")

    let claims
    try {
      claims = await deps.verifier(token)
    } catch {
      throw new ApiError(401, "authentication_error", "Invalid or expired access token")
    }

    if (await deps.cache.get(`ballm:revoked:${claims.sid}`))
      throw new ApiError(401, "authentication_error", "Session has been revoked")

    c.set("claims", claims)
    await next()
  }
}

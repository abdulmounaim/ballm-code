import type { Context } from "hono"
import type { z } from "zod"

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) return { status: error.status, body: { error: error.code, message: error.message } }
  return {
    status: 500,
    body: { error: "server_error", message: "Internal server error" },
  }
}

export async function jsonBody(c: Context): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => undefined)
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export async function parseBody<Schema extends z.ZodType>(c: Context, schema: Schema): Promise<z.infer<Schema>> {
  const result = schema.safeParse(await jsonBody(c))
  if (!result.success) {
    throw new ApiError(400, "invalid_request", result.error.issues.map((issue) => issue.message).join("; "))
  }
  return result.data
}

export function bearer(c: Context): string | undefined {
  const header = c.req.header("authorization")
  const value = header?.match(/^Bearer\s+(.+)$/i)?.[1]
  return value ?? c.req.header("x-api-key")
}

export function clientIp(c: Context, trustProxy: boolean) {
  if (!trustProxy) return c.req.header("x-real-ip")
  const forwarded = c.req.header("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim() ?? c.req.header("x-real-ip")
}

export function readCookie(c: Context, name: string) {
  const header = c.req.header("cookie")
  if (!header) return undefined
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key !== name) continue
    const value = rest.join("=")
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return undefined
}

export function setCookie(
  c: Context,
  name: string,
  value: string,
  input: { maxAge: number; secure: boolean; sameSite?: "Lax" | "Strict" | "None" },
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${input.sameSite ?? "Lax"}`,
    `Max-Age=${input.maxAge}`,
  ]
  if (input.secure) parts.push("Secure")
  c.header("set-cookie", parts.join("; "), { append: true })
}

export function clearCookie(c: Context, name: string, secure: boolean) {
  const parts = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"]
  if (secure) parts.push("Secure")
  c.header("set-cookie", parts.join("; "), { append: true })
}

export function isSecureRequest(c: Context, publicUrl: string) {
  return publicUrl.startsWith("https://") || c.req.header("x-forwarded-proto") === "https"
}

export function requestId(c: Context) {
  return c.get("requestId") as string
}

export function retryAfter(seconds: number) {
  return { "retry-after": String(Math.max(1, Math.ceil(seconds))) }
}

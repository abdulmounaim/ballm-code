export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export interface RequestInput {
  method?: string
  body?: unknown
  orgId?: string
  csrf?: string
  signal?: AbortSignal
  headers?: Record<string, string>
}

/**
 * All console calls are same-origin and cookie-authenticated. The CSRF token and selected org are
 * held in memory by the session provider and attached here, never persisted to storage.
 */
export async function api<T>(path: string, input: RequestInput = {}): Promise<T> {
  const headers = new Headers(input.headers)
  headers.set("accept", "application/json")
  if (input.body !== undefined) headers.set("content-type", "application/json")
  if (input.orgId) headers.set("x-org-id", input.orgId)
  if (input.csrf) headers.set("x-ballm-csrf", input.csrf)
  headers.set("x-requested-with", "ballm-console")

  const response = await fetch(path, {
    method: input.method ?? (input.body === undefined ? "GET" : "POST"),
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    credentials: "same-origin",
    cache: "no-store",
    signal: input.signal,
  })

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const data = text ? parseJson(text) : undefined
  if (!response.ok) {
    const body = data as { error?: string; message?: string } | undefined
    throw new ApiError(
      response.status,
      body?.error ?? "request_failed",
      body?.message ?? `Request failed with HTTP ${response.status}`,
    )
  }
  return data as T
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function describeError(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return "Something went wrong"
}

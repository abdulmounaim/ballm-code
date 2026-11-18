export type LogLevel = "debug" | "info" | "warn" | "error"

const levels: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
  child(fields: Record<string, unknown>): Logger
}

export function createLogger(input: {
  service: string
  region: string
  level?: LogLevel
}): Logger {
  return make(input.service, input.region, levels[input.level ?? "info"], {})
}

function make(
  service: string,
  region: string,
  threshold: number,
  bindings: Record<string, unknown>,
): Logger {
  const write = (level: LogLevel, message: string, fields?: Record<string, unknown>) => {
    if (levels[level] < threshold) return
    const entry = {
      ts: new Date().toISOString(),
      level,
      service,
      region,
      msg: message,
      ...bindings,
      ...redact(fields ?? {}),
    }
    const line = JSON.stringify(entry)
    if (level === "error") console.error(line)
    else if (level === "warn") console.warn(line)
    else console.log(line)
  }

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    child: (fields) => make(service, region, threshold, { ...bindings, ...fields }),
  }
}

const sensitive = /authorization|token|secret|password|api[-_]?key|cookie/i

function redact(fields: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      sensitive.test(key) ? "[redacted]" : typeof value === "string" && value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value,
    ]),
  )
}

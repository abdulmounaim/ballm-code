const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })
const plain = new Intl.NumberFormat()

export function compactNumber(value: number) {
  return value >= 10_000 ? compact.format(value) : plain.format(value)
}

export function fullNumber(value: number) {
  return plain.format(value)
}

export function initials(name: string | null | undefined, email: string) {
  const source = name?.trim()
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean)
    const first = parts[0]?.[0] ?? ""
    const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : ""
    return `${first}${last}`.toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export function shortDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(toDate(value))
}

export function fullDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(toDate(value))
}

export function timeAgo(value: string | Date) {
  const date = toDate(value)
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const absolute = Math.abs(seconds)
  if (absolute < 45) return "just now"
  if (absolute < 3_600) return relative.format(Math.round(seconds / 60), "minute")
  if (absolute < 86_400) return relative.format(Math.round(seconds / 3_600), "hour")
  if (absolute < 2_592_000) return relative.format(Math.round(seconds / 86_400), "day")
  return shortDate(date)
}

export function dayLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)
}

export function percent(value: number, total: number) {
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}

export function errorRate(errors: number, requests: number) {
  if (requests === 0) return "0%"
  return `${((errors / requests) * 100).toFixed(errors / requests < 0.01 ? 2 : 1)}%`
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${fullNumber(count)} ${count === 1 ? singular : pluralForm}`
}

export function titleCase(value: string) {
  return value
    .replaceAll(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim()
}

export function actorLabel(email: string | null | undefined, kind: string) {
  if (email) return email
  return kind.startsWith("admin.") ? "Admin API" : "System"
}

export function auditLabel(kind: string) {
  const known: Record<string, string> = {
    "auth.sso": "Signed in with SSO",
    "auth.refresh_reuse": "Refresh token reuse blocked",
    "config.read": "Client config read",
    "device.approved": "Device approved",
    "console.member.add": "Member added",
    "console.member.role": "Member role changed",
    "console.member.remove": "Member removed",
    "console.model.upsert": "Model saved",
    "console.model.allowlist": "Model allowlist changed",
    "console.policy.update": "Policies updated",
    "console.sso.update": "SSO connection updated",
    "console.upstream.update": "Upstream updated",
    "console.session.revoke": "Session revoked",
    "console.session.revoke_self": "Signed out a device",
    "admin.org.create": "Organization created",
    "admin.member.add": "Member added",
    "admin.member.remove": "Member removed",
    "admin.model.upsert": "Model saved",
    "admin.org.models": "Model allowlist changed",
    "admin.org.policies": "Policies updated",
    "admin.org.sso": "SSO connection updated",
    "admin.org.upstream": "Upstream updated",
    "admin.user.revoke": "All sessions revoked",
    "console.sso.discovery": "SSO discovery checked",
  }
  return known[kind] ?? titleCase(kind)
}

export function parseUserAgent(userAgent: string | null) {
  if (!userAgent) return { browser: "Unknown", os: "Unknown" }
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Unknown"
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(userAgent)
      ? "macOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown"
  return { browser, os }
}

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value)
}

import { describe, expect, test } from "bun:test"
import {
  actorLabel,
  auditLabel,
  compactNumber,
  errorRate,
  initials,
  parseUserAgent,
  percent,
  plural,
  titleCase,
} from "../src/lib/format"

describe("console formatting", () => {
  test("builds initials from names and email addresses", () => {
    expect(initials("Alice Chen", "alice@example.com")).toBe("AC")
    expect(initials("alice", "alice@example.com")).toBe("A")
    expect(initials(null, "bob.martin@example.com")).toBe("BO")
    expect(initials("  ", "carol@example.com")).toBe("CA")
  })

  test("formats compact numbers and rates", () => {
    expect(compactNumber(999)).toBe("999")
    expect(compactNumber(559_708)).toContain("K")
    expect(percent(1, 4)).toBe(25)
    expect(percent(1, 0)).toBe(0)
    expect(errorRate(0, 0)).toBe("0%")
    expect(errorRate(9, 441)).toBe("2.0%")
  })

  test("labels audit events and actors", () => {
    expect(auditLabel("console.member.add")).toBe("Member added")
    expect(auditLabel("something.unknown")).toBe("Something Unknown")
    expect(actorLabel("admin@example.com", "admin.org.create")).toBe("admin@example.com")
    expect(actorLabel(null, "admin.org.create")).toBe("Admin API")
    expect(actorLabel(null, "auth.sso")).toBe("System")
    expect(titleCase("console.sso.discovery")).toBe("Console Sso Discovery")
  })

  test("parses common client user agents", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      ),
    ).toEqual({ browser: "Chrome", os: "macOS" })
    expect(
      parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0"),
    ).toEqual({ browser: "Edge", os: "Windows" })
    expect(parseUserAgent("Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/133.0")).toEqual({
      browser: "Firefox",
      os: "Linux",
    })
    expect(parseUserAgent(null)).toEqual({ browser: "Unknown", os: "Unknown" })
  })

  test("pluralizes counts", () => {
    expect(plural(1, "member")).toBe("1 member")
    expect(plural(2, "member")).toBe("2 members")
  })
})

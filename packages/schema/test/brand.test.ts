import { describe, expect, test } from "bun:test"
import { Brand } from "../src/brand.js"

describe("Ballm brand identity", () => {
  test("desktop app IDs are Ballm-owned and distinct per channel", () => {
    expect(Brand.appID.prod).toBe("com.ballm.code")
    expect(Brand.appID.dev).toBe("com.ballm.code.dev")
    expect(new Set(Object.values(Brand.appID)).size).toBe(Object.values(Brand.appID).length)
    expect(Brand.protocol).toBe("ballm")
  })

  test("AppStream developer matches the Ballm domain", () => {
    expect(Brand.developerID).toBe("com.ballm")
    expect(Brand.appID.prod.split(".").slice(0, 2).join(".")).toBe(Brand.developerID)
  })

  test("update feeds are Ballm-owned", () => {
    for (const url of Object.values(Brand.update.urls)) {
      expect(url.startsWith("https://updates.ballm.internal/desktop/")).toBe(true)
      expect(url.endsWith("/")).toBe(true)
    }
  })

  test("CLI install path cannot collide with upstream opencode", () => {
    expect(Brand.cli.installDir).toBe(".ballm")
    expect(Brand.cli.command).toBe("ballm")
    expect(Brand.cli.bundledBinary).toBe("opencode-cli")
  })

  test("upstream attribution is retained", () => {
    expect(Brand.attribution.name).toBe("OpenCode")
    expect(Brand.attribution.license).toBe("MIT")
    expect(Brand.attribution.notice).toContain("OpenCode")
  })
})

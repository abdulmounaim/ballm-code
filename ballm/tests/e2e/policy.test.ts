import { describe, expect, test } from "bun:test"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../..")

async function policies(file: string) {
  const body = (await Bun.file(path.join(root, file)).json()) as {
    policies: { action: string; resource: string; effect: string }[]
  }
  return body.policies
}

describe("managed policy", () => {
  for (const file of ["managed/linux/opencode.jsonc", "managed/windows/opencode.jsonc"]) {
    test(`${file} denies everything then allows only Ballm`, async () => {
      const list = await policies(file)
      expect(list).toContainEqual({ action: "provider.use", resource: "*", effect: "deny" })
      expect(list).toContainEqual({ action: "provider.use", resource: "ballm", effect: "allow" })
      expect(list).toContainEqual({ action: "integration.connect", resource: "*", effect: "deny" })
      expect(list).toContainEqual({ action: "integration.connect", resource: "ballm", effect: "allow" })
      expect(list).toContainEqual({ action: "integration.use", resource: "ballm*", effect: "allow" })
      expect(list).toContainEqual({ action: "plugin.use", resource: "*", effect: "deny" })
    })
  }
})

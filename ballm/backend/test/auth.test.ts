import { describe, expect, test } from "bun:test"
import {
  createAccessVerifier,
  createAuthKeys,
  generateAuthKeyPair,
  signAccessToken,
} from "@ballm/platform/auth"
import { createSecretBox, generateEncryptionKey } from "@ballm/platform/secrets"

describe("platform auth", () => {
  test("signs and verifies an access token", async () => {
    const pair = await generateAuthKeyPair()
    const keys = await createAuthKeys({
      privateKey: pair.privateKey,
      publicKey: pair.publicKey,
      kid: "test",
      issuer: "https://code.test",
      audience: "ballm-code",
    })
    const token = await signAccessToken(keys, {
      userId: "usr_1",
      orgId: "org_1",
      sessionId: "ses_1",
      ttl: 60,
    })
    const claims = await keys.verify(token)
    expect(claims.sub).toBe("usr_1")
    expect(claims.org).toBe("org_1")
    expect(claims.sid).toBe("ses_1")

    const external = await createAccessVerifier({
      publicKey: pair.publicKey,
      issuer: "https://code.test",
      audience: "ballm-code",
    })
    expect((await external(token)).sub).toBe("usr_1")
  })

  test("rejects the wrong audience and an expired token", async () => {
    const pair = await generateAuthKeyPair()
    const keys = await createAuthKeys({
      privateKey: pair.privateKey,
      publicKey: pair.publicKey,
      kid: "test",
      issuer: "https://code.test",
      audience: "ballm-code",
    })
    const token = await signAccessToken(keys, { userId: "usr_1", orgId: "org_1", sessionId: "ses_1", ttl: 60 })
    const wrong = await createAccessVerifier({
      publicKey: pair.publicKey,
      issuer: "https://code.test",
      audience: "another-app",
    })
    await expect(wrong(token)).rejects.toThrow()

    const expired = await signAccessToken(keys, {
      userId: "usr_1",
      orgId: "org_1",
      sessionId: "ses_1",
      ttl: -10,
    })
    await expect(keys.verify(expired)).rejects.toThrow()
  })

  test("seals and opens secrets", () => {
    const box = createSecretBox(generateEncryptionKey())
    const sealed = box.seal("client-secret")
    expect(sealed).not.toContain("client-secret")
    expect(box.open(sealed)).toBe("client-secret")
    expect(() => createSecretBox(Buffer.alloc(16).toString("base64"))).toThrow()
  })
})

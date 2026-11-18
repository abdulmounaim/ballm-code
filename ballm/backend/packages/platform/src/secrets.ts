import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const VERSION = "v1"

/**
 * AES-256-GCM for SSO client secrets and per-org upstream API keys. The key is a base64
 * 32-byte value from `BALLM_ENCRYPTION_KEY`; rotate by re-sealing rows with a new key.
 */
export function createSecretBox(keyBase64: string) {
  const key = Buffer.from(keyBase64, "base64")
  if (key.length !== 32) throw new Error("BALLM_ENCRYPTION_KEY must be a base64-encoded 32-byte key")

  return {
    seal(value: string) {
      const iv = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", key, iv)
      const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
      const tag = cipher.getAuthTag()
      return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".")
    },
    open(value: string) {
      const [version, iv, tag, ciphertext] = value.split(".")
      if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("invalid sealed secret")
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"))
      decipher.setAuthTag(Buffer.from(tag, "base64url"))
      return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")
    },
  }
}

export type SecretBox = ReturnType<typeof createSecretBox>

export function generateEncryptionKey() {
  return randomBytes(32).toString("base64")
}

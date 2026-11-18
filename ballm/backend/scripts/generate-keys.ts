#!/usr/bin/env bun
import { chmod, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { generateAuthKeyPair } from "@ballm/platform/auth"
import { generateEncryptionKey } from "@ballm/platform/secrets"

const root = path.resolve(import.meta.dir, "..")
const directory = path.join(root, "secrets")
const force = process.argv.includes("--force")

await mkdir(directory, { recursive: true })

const privateFile = path.join(directory, "jwt-private.pem")
const publicFile = path.join(directory, "jwt-public.pem")
const exists = await Bun.file(privateFile).exists()

if (exists && !force) {
  console.error("secrets/jwt-private.pem already exists; pass --force to rotate")
  process.exit(1)
}

const keys = await generateAuthKeyPair()
await writeFile(privateFile, keys.privateKey, { mode: 0o600 })
await writeFile(publicFile, keys.publicKey, { mode: 0o644 })
await chmod(privateFile, 0o600)

console.log(`wrote ${privateFile}`)
console.log(`wrote ${publicFile}`)
console.log("")
console.log("Set this in your secret manager and .env:")
console.log(`BALLM_ENCRYPTION_KEY=${generateEncryptionKey()}`)
console.log("")
console.log("Then point the services at the files:")
console.log("BALLM_JWT_PRIVATE_KEY_FILE=./secrets/jwt-private.pem")
console.log("BALLM_JWT_PUBLIC_KEY_FILE=./secrets/jwt-public.pem")

import { createApp } from "./app.js"
import { loadConfig } from "./env.js"
import { open } from "./store/db.js"

const config = loadConfig()
const db = open(config.db)
const app = createApp(db, config)

const server = Bun.serve({ port: config.port, fetch: app.fetch })
console.log(`Ballm control plane listening on ${config.publicUrl} (${server.port})`)

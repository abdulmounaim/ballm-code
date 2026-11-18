import { Brand } from "@opencode/schema/brand"
import { resolveChannel } from "./utils"

const arg = process.argv[2]

const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

const appId = Brand.appID[channel]

const productName = channel === "prod" ? Brand.name : channel === "beta" ? `${Brand.name} Beta` : Brand.devName

const summary = `The internal coding agent${channel !== "prod" ? ` (${channel})` : ""}`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>

  <name>${productName}</name>
  <summary>${summary}</summary>

  <developer id="com.ballm">
    <name>${Brand.legalName}</name>
  </developer>

  <description>
    <p>
      ${Brand.name} is the internal coding agent built on OpenCode. It connects to the Ballm control
      plane for models, policy, and audit.
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

  <url type="homepage">${Brand.website}</url>
  <url type="help">${Brand.support}</url>
</component>
`

await Bun.write(`resources/${appId}.metainfo.xml`, xml)

console.log(`Generated metainfo for ${channel} at resources/${appId}.metainfo.xml`)

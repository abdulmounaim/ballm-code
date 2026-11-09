import { Schema } from "effect"

export const Device = Schema.Struct({
  device_code: Schema.String,
  user_code: Schema.String,
  verification_uri_complete: Schema.String,
  expires_in: Schema.Number,
  interval: Schema.Number,
})

export const Token = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_in: Schema.Number,
  org_id: Schema.optional(Schema.NullOr(Schema.String)),
})

export const TokenPending = Schema.Struct({ error: Schema.String })

export const DeviceToken = Schema.Union([Token, TokenPending])

export const User = Schema.Struct({ id: Schema.String, email: Schema.String })

export const Org = Schema.Struct({ id: Schema.String, name: Schema.String })

export const InvalidGrant = Schema.Struct({ error: Schema.Literal("invalid_grant") })

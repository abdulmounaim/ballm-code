import { Schema } from "effect"

// The backend revoked or expired the refresh token; only a new device login recovers.
export class SignedOutError extends Schema.TaggedError<SignedOutError>()("Ballm.SignedOut", {}) {
  override get message() {
    return "Reconnect Ballm to continue"
  }
}

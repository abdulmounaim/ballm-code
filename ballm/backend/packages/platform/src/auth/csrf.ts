import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/**
 * Derives a CSRF token that is bound to one browser session. It needs no storage: the control
 * plane can recompute it from the session id, and the key never leaves the server. Rotating
 * `BALLM_ENCRYPTION_KEY` invalidates outstanding tokens, which only forces a page reload.
 */
export function csrfToken(encryptionKey: string, sessionId: string) {
  // Derive a separate MAC key instead of reusing the AES key bytes directly.
  const key = createHash("sha256")
    .update(Buffer.from(encryptionKey, "base64"))
    .update("ballm-csrf-v1")
    .digest()
  return createHmac("sha256", key).update(`ballm:csrf:${sessionId}`).digest("base64url")
}

export function verifyCsrfToken(encryptionKey: string, sessionId: string, candidate: string | undefined) {
  if (!candidate) return false
  const expected = Buffer.from(csrfToken(encryptionKey, sessionId))
  const actual = Buffer.from(candidate)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

# Backend contract

The client is written against these shapes. They intentionally mirror the OpenCode Console contract
so the Ballm integration stays close to `packages/core/src/plugin/provider/opencode.ts`.

Two base URLs:

- control plane: `BALLM_PUBLIC_URL`, for example `https://code.ballm.internal`
- gateway: `BALLM_GATEWAY_PUBLIC_URL`, for example `https://ai.ballm.internal`

All bodies are JSON unless noted. Access tokens are Ed25519 JWTs; the client treats them as opaque
strings.

## Device authorization

### `POST /auth/device/code`

```json
{ "client_id": "ballm-cli", "supports_org_scope": true }
```

Response:

```json
{
  "device_code": "opaque",
  "user_code": "ABCD-EFGH",
  "verification_uri_complete": "https://code.ballm.internal/console/device?user_code=ABCD-EFGH",
  "expires_in": 600,
  "interval": 5
}
```

### `POST /auth/device/token`

Device grant:

```json
{
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
  "device_code": "opaque",
  "client_id": "ballm-cli"
}
```

Refresh grant:

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "opaque",
  "client_id": "ballm-cli"
}
```

Success:

```json
{
  "access_token": "eyJ...",
  "refresh_token": "opaque",
  "expires_in": 300,
  "org_id": "org_..."
}
```

Pending or failure, with HTTP 400:

```json
{ "error": "authorization_pending" }
```

Other errors: `slow_down`, `expired_token`, `access_denied`, `invalid_grant`,
`unsupported_grant_type`.

Refresh tokens rotate on every use. Reusing a rotated token revokes the whole token family and the
session.

### `POST /auth/device/revoke`

```json
{ "token": "access-or-refresh-token" }
```

Always returns `{ "ok": true }` for an unknown token.

## Browser approval and SSO

### `GET /console/device?user_code=...`

The browser approval page inside the console SPA. A signed-out user enters their work email. The
control plane finds the organization whose `allowed_domains` contains that domain and redirects to
its OIDC provider. `GET /device` returns a `302` to this route so links already printed in a terminal
keep working.

### `GET /auth/sso/:orgSlug/start`

Starts the OIDC authorization-code + PKCE flow. The IdP must expose a discovery document with
`authorization_endpoint`, `token_endpoint`, and `jwks_uri`.

### `GET /auth/sso/callback`

Validates `state`, `nonce`, and the ID token, creates the user and membership, sets the
`ballm_browser` HttpOnly cookie, and approves a pending device code when the flow started from
`/console/device`. On HTTPS the cookie is named `__Host-ballm_browser`, which pins it to the exact
origin.

### `GET /auth/sso/me`

Returns the browser session's user and organizations.

### `GET /auth/sso/logout`

Revokes the browser session and clears the cookie.

## Password identity (Ory Kratos)

Password and passkey credentials live in Kratos. The control plane proxies its public API under
`/self-service/*` and `/sessions/*` so the console stays same-origin. These endpoints exist only
when `BALLM_KRATOS_PUBLIC_URL` is set.

### `GET /auth/config`

Public capabilities for the sign-in UI.

```json
{ "password": { "enabled": true }, "signup": true, "sso": true }
```

### `GET /auth/password/:mode`

`mode` is `login`, `register`, `recover`, `settings`, or `verify`. Stores device approval and
invitation context in `auth_states` for 15 minutes, then redirects to the Kratos browser flow with a
`return_to` of `/auth/password/complete?state=...`.

### `GET /auth/password/complete`

Reads `ory_kratos_session`, verifies the identity through Kratos `sessions/whoami`, and requires a
verified address. It links `users.identity_id`, creates the personal workspace, accepts a pending
invitation when the flow carried one, approves the device code when the flow started from a
terminal, sets the browser cookie, and redirects to `/console/`.

### `GET /auth/invite?token=...`

Public invitation summary: organization name, invited address, and role.

### `POST /auth/invite/accept`

Accepts `{ "token": "..." }` for the signed-in account. The address must match the invitation.
Replay and expiry return `404`; a mismatched account returns `403`.

## Invitations

`POST /api/console/invites` creates a single-use token and emails it. The response includes the link
and `delivered: false` when SMTP is not configured. Tokens are hashed at rest, expire after seven
days, and are bound to the invited address.

## Workspaces

`POST /api/console/orgs` creates a team workspace for the signed-in user. Every account also has a
personal workspace created at first sign-in (`orgs.kind = 'personal'`). `X-Org-Id` selects the active
workspace on each console request.

### `POST /auth/dev/login`

Only when `BALLM_DEV_AUTH=1` and never in production.

```json
{ "email": "dev@ballm.internal", "org": "ballm", "user_code": "ABCD-EFGH" }
```

## JWKS

### `GET /.well-known/jwks.json`

Returns the active Ed25519 public key. Gateways can verify access tokens with this URL or with a
mounted `BALLM_JWT_PUBLIC_KEY_FILE`.

```json
{ "keys": [{ "kty": "OKP", "crv": "Ed25519", "x": "...", "kid": "ballm-1", "alg": "EdDSA", "use": "sig" }] }
```

## Directory

### `GET /api/user`

`Authorization: Bearer <access>`

```json
{ "id": "usr_...", "email": "dev@ballm.internal" }
```

### `GET /api/orgs`

```json
[{ "id": "org_...", "name": "Platform" }]
```

## Remote client config

### `GET /api/v2/config`

Headers: `Authorization: Bearer <access>`, optional `X-Org-Id: <org>`.

The token's organization is the default. If the header names another organization, the user must
have a membership there.

```json
{
  "providers": {
    "ballm": {
      "name": "Ballm",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "https://ai.ballm.internal/v1" },
      "models": {
        "ballm-fast": {
          "name": "Ballm Fast",
          "limit": { "context": 200000, "output": 32000 }
        }
      }
    }
  },
  "mcp": { "servers": {} },
  "policies": [
    { "action": "provider.use", "resource": "*", "effect": "deny" },
    { "action": "provider.use", "resource": "ballm", "effect": "allow" }
  ]
}
```

Only the allow-listed keys `providers`, `mcp`, `policies`, and `websearch` are accepted by the
client. The client never loads plugins, commands, or local MCP servers from this response.

If the organization has no enabled models the endpoint returns `404`, and the client keeps the
provider unavailable.

## Gateway

OpenAI-compatible:

- `GET /v1/models`
- `POST /v1/chat/completions` (streaming and non-streaming)
- any other `/v1/*` path supported by the upstream

Authentication: `Authorization: Bearer <access>` or `X-Api-Key: <access>`.

Errors use the OpenAI envelope:

```json
{ "error": { "type": "authentication_error", "message": "Invalid or expired access token" } }
```

The gateway:

- verifies the JWT locally;
- checks the revoked-session cache;
- enforces the organization's model allowlist;
- rewrites the requested Ballm model id to the upstream model id;
- injects the organization's upstream API key;
- never forwards the client token upstream;
- applies a per-user fixed-window rate limit;
- records usage when the upstream returns a `usage` object, including the final SSE usage chunk.

## Admin API

Admin routes require `Authorization: Bearer <BALLM_ADMIN_TOKEN>`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/admin/orgs` | list organizations |
| POST | `/api/v1/admin/orgs` | create an organization |
| GET | `/api/v1/admin/orgs/:orgId/users` | list members |
| POST | `/api/v1/admin/orgs/:orgId/members` | add a member |
| DELETE | `/api/v1/admin/orgs/:orgId/members/:userId` | remove a member and revoke their sessions in the org |
| POST | `/api/v1/admin/users/:userId/revoke` | revoke all sessions for a user |
| GET | `/api/v1/admin/models` | list catalog models |
| PUT | `/api/v1/admin/models/:id` | upsert a catalog model |
| PUT | `/api/v1/admin/orgs/:orgId/models` | set the org's enabled models |
| GET | `/api/v1/admin/orgs/:orgId/policies` | read delivered policies |
| PUT | `/api/v1/admin/orgs/:orgId/policies` | replace delivered policies |
| GET | `/api/v1/admin/orgs/:orgId/sso` | read SSO settings (secret redacted) |
| PUT | `/api/v1/admin/orgs/:orgId/sso` | configure OIDC |
| PUT | `/api/v1/admin/orgs/:orgId/upstream` | set the org upstream URL and key |

SSO client secrets and upstream API keys are encrypted with AES-256-GCM before storage.

## Console API

The console is served from `/console/` and calls `/api/console/*`. It authenticates with the
`ballm_browser` cookie, not the admin token. Mutations require `X-Ballm-Csrf`, returned by
`GET /api/console/session`, and an `Origin` that matches the canonical public origin or the host the
request arrived on.

```text
GET    /api/console/session
POST   /api/console/logout
GET    /api/console/overview
GET    /api/console/me
DELETE /api/console/me/sessions/:id
GET|POST   /api/console/members
PATCH|DELETE /api/console/members/:userId
GET    /api/console/models
PUT    /api/console/models/:id
PUT    /api/console/models
GET|PUT /api/console/policies
GET|PUT /api/console/sso
POST   /api/console/sso/test
GET|PUT /api/console/upstream
POST   /api/console/upstream/test
GET    /api/console/sessions
DELETE /api/console/sessions/:id
GET    /api/console/usage
GET    /api/console/audit
POST   /api/console/sign-in
GET    /api/console/device
POST   /api/console/device/start
POST   /api/console/device/approve
```

Roles are `owner`, `admin`, and `member`. The server reads the role from Postgres on every request;
the client never sends it. The last owner cannot be removed or demoted.

Errors use the control-plane envelope:

```json
{ "error": "forbidden", "message": "Only an owner can change owner roles" }
```

The console shell is returned with a strict CSP, `X-Frame-Options: DENY`, `Referrer-Policy:
no-referrer`, and HSTS when the public URL is HTTPS. API responses are `no-store`.

## Status codes the client handles

| Status | Meaning | Client behavior |
| --- | --- | --- |
| 401 | token expired or revoked | mark connection `needs_auth`, ask to reconnect |
| 403 | authorization denied / SSO required | show the backend message |
| 404 | no config in this org | keep provider unavailable |
| 429 | rate limited | back off and retry after `retry-after` |
| 5xx/timeout | transient | keep the last known config |

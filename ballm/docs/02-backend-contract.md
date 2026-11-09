# Backend contract

The client is written against these shapes. They intentionally mirror the OpenCode Console contract
so the Ballm integration stays close to `packages/core/src/plugin/provider/opencode.ts`.

Base URL is `BALLM_PUBLIC_URL` (for example `https://code.ballm.internal`). All bodies are JSON
unless noted.

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
  "verification_uri_complete": "https://code.ballm.internal/device?user_code=ABCD-EFGH",
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
  "access_token": "opaque",
  "refresh_token": "opaque",
  "expires_in": 3600,
  "org_id": "org_..."
}
```

Pending or failure, with HTTP 400:

```json
{ "error": "authorization_pending" }
```

Other errors: `slow_down`, `expired_token`, `access_denied`, `invalid_grant`.

### `POST /auth/device/approve`

Development and SSO-callback endpoint. In production this is performed by the browser approval page
after the IdP callback.

```json
{ "user_code": "ABCD-EFGH", "email": "dev@ballm.internal", "org_id": "org_..." }
```

### `POST /auth/device/revoke`

```json
{ "token": "access-or-refresh-token" }
```

Always returns `{ "ok": true }` for an unknown token.

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

Headers: `Authorization: Bearer <access>`, `X-Org-Id: <org>`.

```json
{
  "providers": {
    "ballm": {
      "name": "Ballm",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "https://code.ballm.internal/v1" },
      "models": {
        "ballm-fast": {
          "name": "Ballm Fast",
          "limit": { "context": 200000, "output": 32000 }
        }
      }
    }
  },
  "mcp": { "servers": {} },
  "websearch": { "provider": "ballm" },
  "policies": [
    { "action": "provider.use", "resource": "*", "effect": "deny" },
    { "action": "provider.use", "resource": "ballm", "effect": "allow" }
  ]
}
```

Only the allow-listed keys `providers`, `mcp`, `policies`, and `websearch` are accepted by the
client. The client never loads plugins, commands, or local MCP servers from this response.

## Gateway

OpenAI-compatible:

- `GET /v1/models`
- `POST /v1/chat/completions` (streaming and non-streaming)
- `POST /v1/messages` (optional, if Anthropic-style clients are needed)

Authentication: `Authorization: Bearer <access>` or `X-Api-Key: <access>`.

Errors use the OpenAI envelope:

```json
{ "error": { "type": "authentication_error", "message": "Invalid or expired token" } }
```

The gateway validates the token, enforces the org model allowlist, forwards to the configured
upstream, and records usage. It must never forward the client token upstream.

## Status codes the client handles

| Status      | Meaning                             | Client behavior                                |
| ----------- | ----------------------------------- | ---------------------------------------------- |
| 401         | token expired or revoked            | mark connection `needs_auth`, ask to reconnect |
| 403         | authorization denied / SSO required | show the backend message                       |
| 404         | no config in this org               | keep provider unavailable                      |
| 5xx/timeout | transient                           | keep the last known config                     |

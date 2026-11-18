# Ballm platform backend

Two services on PostgreSQL:

- **control-plane** — SSO, device authorization, users, orgs, remote client config, admin API, JWKS
- **gateway** — JWT verification, per-org model allowlists, rate limits, upstream proxy, usage

Both are stateless and scale horizontally. PostgreSQL is the source of truth; Redis/Valkey provides
shared rate limits, catalog caching, and fast revocation.

## Layout

```text
packages/platform/     env, Postgres, migrations, JWT, secrets, Redis, logging, metrics
services/control-plane/
services/gateway/
migrations/            forward-only SQL
helm/ballm-code/       Kubernetes chart
scripts/               key generation and the Docker-backed test runner
test/                  integration tests against real Postgres
```

## Quick start

```sh
cd ballm/backend
bun install
bun run keys                 # writes secrets/ and prints BALLM_ENCRYPTION_KEY
cp .env.example .env         # fill in the generated encryption key
docker compose up --build    # Postgres, Redis, migrations, both services
```

Control plane: `http://localhost:8787`  
Gateway: `http://localhost:8788`

The compose file runs the migration Job before the control plane. For a direct dev loop without
Docker:

```sh
export DATABASE_URL=postgres://ballm:ballm@localhost:5432/ballm
export REDIS_URL=redis://localhost:6379
bun run migrate
bun run dev:control
bun run dev:gateway
```

## Environment

| Variable | Purpose |
| --- | --- |
| `BALLM_ENV` | `development`, `test`, or `production` |
| `BALLM_REGION` | Label for logs and metrics |
| `BALLM_PUBLIC_URL` | Control-plane public URL, used in device and SSO redirects |
| `BALLM_GATEWAY_PUBLIC_URL` | Gateway URL returned in remote config |
| `DATABASE_URL` | Postgres primary; control plane writes here |
| `DATABASE_READ_URL` | Optional regional read replica for the gateway |
| `REDIS_URL` | Shared cache, rate limits, revocation, invalidation |
| `BALLM_JWT_*_KEY_FILE` | Ed25519 signing key files (`bun run keys`) |
| `BALLM_JWT_ISSUER` / `BALLM_JWT_AUDIENCE` | Access-token claims |
| `BALLM_ACCESS_TTL` | Access JWT lifetime, default 300 seconds |
| `BALLM_REFRESH_TTL` | Refresh-token lifetime, default 30 days |
| `BALLM_BROWSER_TTL` | Browser SSO session lifetime |
| `BALLM_ENCRYPTION_KEY` | AES-256-GCM key for SSO secrets and upstream keys |
| `BALLM_ADMIN_TOKEN` | Bootstrap admin API bearer token |
| `BALLM_BOOTSTRAP_*` | First org, admin email, starter models |
| `BALLM_BOOTSTRAP_SSO_*` | Optional first OIDC connection |
| `BALLM_UPSTREAM_BASE_URL` / `_API_KEY` | Fallback upstream when an org has no override |
| `BALLM_GATEWAY_*` | Timeouts and per-user rate limit |
| `BALLM_DEV_AUTH` | Local-only `/auth/dev/login`; rejected in production |

## Auth model

- Access tokens are Ed25519 JWTs: `sub`, `org`, `sid`, `jti`, `iss`, `aud`, `exp`.
- Refresh tokens are opaque, hashed at rest, and rotate on every use with reuse detection.
- The gateway verifies JWTs locally. It uses the public key file or the control plane JWKS URL.
- Revocation writes `ballm:revoked:<sid>` to Redis and marks the session revoked in Postgres.
- SSO uses OIDC authorization code + PKCE, state, and nonce. The IdP must expose discovery and
  JWKS endpoints. Group claims can map to `owner`, `admin`, or `member`.

## Device flow

1. Client calls `POST /auth/device/code`.
2. Browser opens `/device?user_code=...`.
3. User enters their work email; the control plane finds the org whose SSO domain matches.
4. The user authenticates at the org IdP.
5. The callback approves the device code.
6. Client polls `POST /auth/device/token` and receives a JWT + refresh token.

## Admin API

All routes require `Authorization: Bearer <BALLM_ADMIN_TOKEN>`.

```text
GET    /api/v1/admin/orgs
POST   /api/v1/admin/orgs
GET    /api/v1/admin/orgs/:orgId/users
POST   /api/v1/admin/orgs/:orgId/members
DELETE /api/v1/admin/orgs/:orgId/members/:userId
GET    /api/v1/admin/models
PUT    /api/v1/admin/models/:id
PUT    /api/v1/admin/orgs/:orgId/models
GET    /api/v1/admin/orgs/:orgId/policies
PUT    /api/v1/admin/orgs/:orgId/policies
GET    /api/v1/admin/orgs/:orgId/sso
PUT    /api/v1/admin/orgs/:orgId/sso
PUT    /api/v1/admin/orgs/:orgId/upstream
```

Client secrets and upstream API keys are sealed with AES-256-GCM before storage and never returned
by the read endpoints.

## Multi-region

- One Postgres primary; regional read replicas for gateways.
- Control plane in the primary region; gateways in every region.
- JWT verification is local, so inference does not cross regions for auth.
- Each region has its own Redis/Valkey for rate limits; use a replicated cache if global quotas are
  required.
- Catalog changes publish `ballm:invalidate`; gateways clear their local and Redis cache.
- Access tokens are short-lived. Revocation is immediate in the region that handled it and bounded
  by `BALLM_ACCESS_TTL` elsewhere unless Redis is replicated.

## Tests

```sh
bun run test
```

The runner starts a disposable `postgres:17-alpine` container on port 55432, runs migrations, and
executes the integration tests. Set `TEST_DATABASE_URL` to use an existing database instead.

## Production checklist

- Run migrations as a Kubernetes Job or compose one-shot, not on every replica.
- Set `BALLM_ENV=production`, `BALLM_DEV_AUTH=0`, and a real `BALLM_ADMIN_TOKEN`.
- Use TLS at the ingress and keep the services on private networking.
- Point `DATABASE_READ_URL` at a regional replica.
- Use a replicated Redis/Valkey for global rate limits and revocation.
- Ship JSON logs and `/metrics` to your observability stack.
- Back up Postgres; audit and usage tables are partitioned by month.

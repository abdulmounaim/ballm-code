# Coolify deployment

Ballm Code runs as two Coolify applications from the same repository and image:

- `ballm-control` — control plane, console, and the public `/v1` entry point
- `ballm-gateway` — internal model gateway; no public domain

The control plane proxies `/v1/*` to `http://ballm-gateway:8788`, so `code.baytai.io` is the only
public hostname. PostgreSQL and Redis are Coolify databases on the same destination network.

## Layout

```text
Internet
   │
   ▼
https://code.baytai.io  ──▶  ballm-control:8787
                                  │  /v1/* proxy
                                  ▼
                             ballm-gateway:8788
                                  │
                                  ▼
                        ballm-postgres / ballm-redis
```

## Coolify resources

| Resource | Type | Name | Internal name | Port | Public domain |
| --- | --- | --- | --- | --- | --- |
| Control plane | Application | `ballm-control` | `ballm-control` | 8787 | `https://code.baytai.io` |
| Gateway | Application | `ballm-gateway` | `ballm-gateway` | 8788 | none |
| PostgreSQL | Database | `ballm-postgres` | `ballm-postgres` | 5432 | none |
| Redis | Database | `ballm-redis` | `ballm-redis` | 6379 | none |

All four resources use the same project, environment, server, and destination (`coolify` network).

## Application settings

Both applications use the same repository and Dockerfile:

```text
Build pack:      Dockerfile
Base directory:  ballm/backend        # use . if the repository contains only the backend
Dockerfile:      Dockerfile
```

Set `custom_internal_name` so the gateway hostname survives deployments. Do not use the generated
`{uuid}-{timestamp}` container name.

## Environment: control plane

```sh
BALLM_ENV=production
BALLM_REGION=baytai
BALLM_PUBLIC_URL=https://code.baytai.io
BALLM_GATEWAY_PUBLIC_URL=https://code.baytai.io
BALLM_GATEWAY_INTERNAL_URL=http://ballm-gateway:8788
BALLM_SERVICE=control-plane
PORT=8787
BALLM_TRUST_PROXY=1
BALLM_MIGRATE_ON_START=1
BALLM_DEV_AUTH=0
BALLM_CONSOLE_DIR=/app/console/dist

DATABASE_URL=postgres://ballm:<password>@ballm-postgres:5432/ballm
REDIS_URL=redis://default:<password>@ballm-redis:6379

BALLM_JWT_ISSUER=https://code.baytai.io
BALLM_JWT_AUDIENCE=ballm-code
BALLM_JWT_KID=ballm-1
BALLM_JWT_PRIVATE_KEY=<base64 of jwt-private.pem>
BALLM_JWT_PUBLIC_KEY=<base64 of jwt-public.pem>
BALLM_ENCRYPTION_KEY=<base64 32 bytes>
BALLM_ADMIN_TOKEN=<long random token>

BALLM_BOOTSTRAP_ORG_ID=org_ballm
BALLM_BOOTSTRAP_ORG_SLUG=ballm
BALLM_BOOTSTRAP_ORG_NAME=Ballm
BALLM_BOOTSTRAP_ADMIN_EMAIL=admin@baytai.io
BALLM_BOOTSTRAP_MODELS=ballm-fast:Ballm Fast,ballm-reasoning:Ballm Reasoning
```

## Environment: gateway

```sh
BALLM_ENV=production
BALLM_REGION=baytai
BALLM_SERVICE=gateway
GATEWAY_PORT=8788
BALLM_PUBLIC_URL=https://code.baytai.io
BALLM_GATEWAY_PUBLIC_URL=https://code.baytai.io
BALLM_TRUST_PROXY=1

DATABASE_URL=postgres://ballm:<password>@ballm-postgres:5432/ballm
REDIS_URL=redis://default:<password>@ballm-redis:6379

BALLM_JWT_ISSUER=https://code.baytai.io
BALLM_JWT_AUDIENCE=ballm-code
BALLM_JWT_PUBLIC_KEY=<base64 of jwt-public.pem>
BALLM_ENCRYPTION_KEY=<the same 32-byte key>
```

The gateway only needs the public key. `BALLM_ENCRYPTION_KEY` decrypts per-organization upstream keys
stored by the control plane, so both services must share it.

## Generate secrets

```sh
openssl genpkey -algorithm ED25519 -out jwt-private.pem
openssl pkey -in jwt-private.pem -pubout -out jwt-public.pem
openssl rand -base64 32        # BALLM_ENCRYPTION_KEY
openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c 56   # BALLM_ADMIN_TOKEN
base64 -w0 jwt-private.pem     # BALLM_JWT_PRIVATE_KEY
base64 -w0 jwt-public.pem      # BALLM_JWT_PUBLIC_KEY
```

Inline PEM values are accepted as base64, so no newline escaping is needed.

## First deployment

1. Create the project, PostgreSQL, and Redis.
2. Start PostgreSQL and Redis and wait for `running:healthy`.
3. Create `ballm-gateway` with `custom_internal_name=ballm-gateway`, no domain, and its env.
4. Create `ballm-control` with `custom_internal_name=ballm-control`, domain
   `https://code.baytai.io`, health check `/health`, and its env.
5. Deploy the gateway, then the control plane.
6. Verify:

```sh
curl -fsS https://code.baytai.io/health
curl -fsS https://code.baytai.io/ready
curl -fsS -o /dev/null -w '%{http_code}\n' https://code.baytai.io/console/
curl -fsS https://code.baytai.io/api/v2/config   # 401 without a token
curl -fsS https://code.baytai.io/v1/models       # 401 without a token
```

7. Configure SSO through the admin API. The redirect URI is
   `https://code.baytai.io/auth/sso/callback`. Until SSO is configured, people cannot sign in to the
   console, but the admin API and gateway are available.

```sh
curl -X PUT https://code.baytai.io/api/v1/admin/orgs/org_ballm/sso \
  -H "authorization: Bearer $BALLM_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "issuer": "https://idp.example.com/realms/ballm",
    "clientId": "ballm-code",
    "clientSecret": "...",
    "allowedDomains": ["baytai.io"],
    "groupClaim": "groups",
    "groupRoles": {"ballm-engineering": "member", "ballm-platform": "admin", "ballm-owners": "owner"}
  }'
```

## Operations

- Migrations run at control-plane start under an advisory lock. Keep one control-plane replica while
  this is enabled, or move migrations to a Coolify pre-deployment command and set
  `BALLM_MIGRATE_ON_START=0`.
- Back up `ballm-postgres` with a Coolify backup schedule.
- `ballm-redis` is a cache and revocation store; losing it is safe, but revocations fall back to the
  access-token lifetime.
- Set the organization's upstream in the console or with
  `PUT /api/v1/admin/orgs/:orgId/upstream`.
- Rotate the admin token and JWT keys independently. Changing `BALLM_ENCRYPTION_KEY` requires
  re-sealing SSO and upstream secrets.

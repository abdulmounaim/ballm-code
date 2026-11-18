# Development

## Prerequisites

- Bun `1.4.4` (the version pinned by the repository)
- Docker, for the disposable Postgres test container and the local compose stack
- Node 22+ for tooling that still expects it
- Git

```sh
curl -fsSL https://bun.sh/install | bash
```

## First run

```sh
cd ballm/backend
bun install
bun run keys                 # writes secrets/ and prints BALLM_ENCRYPTION_KEY
cp .env.example .env         # paste the printed encryption key
```

### Full local stack

```sh
make -C ballm compose-up
```

That starts Postgres 17, Valkey, a migration job, the control plane on `:8787`, and the gateway on
`:8788`. The control plane bootstraps `BALLM_BOOTSTRAP_ORG_SLUG` and the starter models from
`BALLM_BOOTSTRAP_MODELS`.

### Service-by-service

```sh
# terminal 1: Postgres + Redis only
cd ballm/backend
docker compose up postgres redis

# terminal 2: migrations
bun run migrate

# terminal 3: control plane
bun run dev:control

# terminal 4: gateway
bun run dev:gateway
```

The client still starts from the repository root:

```sh
make -C ballm dev
```

In the TUI, connect the `Ballm` integration and approve the device at `http://localhost:8787/device`
using `dev@ballm.internal`.

## Backend environment

The full table is in [`ballm/backend/README.md`](../backend/README.md). The values you will touch
most:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres primary |
| `DATABASE_READ_URL` | Regional read replica for gateways |
| `REDIS_URL` | Shared rate limit, cache, revocation |
| `BALLM_JWT_PRIVATE_KEY_FILE` / `PUBLIC_KEY_FILE` | Ed25519 keys |
| `BALLM_ENCRYPTION_KEY` | AES-256-GCM key for stored secrets |
| `BALLM_ADMIN_TOKEN` | Admin API bearer token |
| `BALLM_BOOTSTRAP_*` | First org, admin, starter models |
| `BALLM_DEV_AUTH` | Local-only `/auth/dev/login`; never in production |

## Client environment

| Variable | Purpose |
| --- | --- |
| `BALLM_SERVER` | Override the integration URL from the default |
| `BALLM_DISABLE_FREE_MODELS` | Reserved for the fork bootstrap |

## SSO

SSO is configured per organization through the admin API. Any OIDC provider with discovery works
(Keycloak, Authentik, Entra ID, Okta, and similar).

```sh
curl -X PUT http://localhost:8787/api/v1/admin/orgs/org_ballm/sso \
  -H "authorization: Bearer $BALLM_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "issuer": "https://idp.example.com/realms/ballm",
    "clientId": "ballm-code",
    "clientSecret": "...",
    "allowedDomains": ["ballm.internal"],
    "groupClaim": "groups",
    "groupRoles": { "ballm-engineering": "member", "ballm-platform": "admin" }
  }'
```

The IdP redirect URI is `$BALLM_PUBLIC_URL/auth/sso/callback`.

The device page resolves the organization from the email domain. If several organizations share a
domain, the first match is used; give each organization a distinct domain or add an org picker when
that becomes a real use case.

## Models and policies

```sh
# create a catalog model
curl -X PUT http://localhost:8787/api/v1/admin/models/ballm-reasoning \
  -H "authorization: Bearer $BALLM_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"id":"ballm-reasoning","name":"Ballm Reasoning","upstreamModel":"reasoning-v1"}'

# enable it for an org
curl -X PUT http://localhost:8787/api/v1/admin/orgs/org_ballm/models \
  -H "authorization: Bearer $BALLM_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"modelIds":["ballm-fast","ballm-reasoning"]}'
```

Policies use the same statements as `ballm/managed/*`; the delivered list is the baseline for
unmanaged machines, while managed policy still outranks it.

## Tests

```sh
make -C ballm test          # disposable Postgres, migrations, integration tests
make -C ballm typecheck     # client core + backend
make -C ballm verify        # backend, policy, core, schema, desktop, app, brand audit
```

`make test` starts `postgres:17-alpine` on port 55432 and removes it afterwards. To use an existing
database:

```sh
TEST_DATABASE_URL=postgres://user:pass@host:5432/ballm_test bun run test
```

## Branding

Brand constants live in `packages/schema/src/brand.ts`. Source art lives in
`ballm/distro/branding/source/`.

```sh
make -C ballm icons
make -C ballm brand-audit
```

## CLI and desktop

The published package still exposes `opencode`; the fork adds `ballm` as an alias and the installer
writes `~/.ballm/bin/ballm`.

```sh
make -C ballm build-cli
make -C ballm build-desktop
```

On a memory-constrained machine, set `BALLM_SKIP_WEB_UI=1` when building the CLI.

## Upstream sync

```sh
make -C ballm sync
```

The script fetches `upstream/dev`, shows the pinned and candidate commits, and rebases
`internal/main`. Resolve conflicts only in the registration and branding points;
`packages/core/src/ballm/` and `ballm/` are ours.

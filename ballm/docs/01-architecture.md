# Architecture

## Components

```text
                         browser / SSO (OIDC)
                                  │
                                  ▼
┌──────────────────┐      ┌──────────────────────┐
│ Ballm Code       │      │ Control plane        │
│ TUI / desktop    │─────▶│ /auth/device/*       │
│                  │      │ /auth/sso/*          │
│ BallmPlugin      │      │ /api/console/*       │
│ - device login   │      │ /console/ SPA        │
│ - remote config  │      │ /api/v2/config       │
│ - provider wiring│      │ /api/v1/admin/*      │
└────────┬─────────┘      │ /.well-known/jwks    │
         │                └──────┬───────────────┘
         │                       │ writes
         │ inference             ▼
         │                ┌──────────────┐
         │                │ PostgreSQL   │
         │                │ primary +    │
         │                │ replicas     │
         │                └──────┬───────┘
         │                       │ reads
         ▼                       ▼
┌──────────────────────┐  ┌──────────────┐
│ Gateway              │◀─│ Redis/Valkey │
│ JWT verify           │  │ cache, rate  │
│ org model allowlist  │  │ limit, revoke│
│ proxy + usage        │  └──────────────┘
└──────────┬───────────┘
           ▼
     Ballm upstream
```

## Services

**Control plane** owns writes, identity, and policy:

- device authorization and token rotation;
- OIDC authorization-code + PKCE, browser sessions, device approval;
- users, organizations, memberships, SSO connections;
- remote client config, org model allowlists, delivered policy;
- browser console for people, served as a SolidJS SPA at `/console/`;
- admin API for orgs, members, models, policies, SSO, and upstream settings;
- JWKS for access-token verification.

**Gateway** owns the inference path:

- local JWT verification with the control plane's public key or JWKS;
- revoked-session check through Redis;
- organization model allowlist cache;
- request rewrite from Ballm model IDs to upstream IDs;
- upstream API key injection;
- rate limiting and usage recording;
- streaming pass-through and SSE usage capture.

Both services are stateless and can run as many replicas as needed. For single-domain deployments,
set `BALLM_GATEWAY_INTERNAL_URL` on the control plane; it proxies `/v1/*` to the internal gateway so
only the control-plane hostname is public.

## Client request path

1. `BallmPlugin` registers integration `ballm` with a device OAuth method.
2. The user runs `opencode auth login` (or the TUI integration dialog) and opens the approval URL.
3. `/device` resolves the user's organization from their email domain and starts OIDC.
4. The callback creates the user/membership and approves the device code.
5. The client polls `/auth/device/token` and receives a JWT + rotating refresh token.
6. The plugin fetches `/api/v2/config` with the access token and `X-Org-Id`.
7. The response is wrapped as an integration config document and applied through
   `ConfigProviderPlugin.integrate`.
8. Inference goes to the gateway. `model-resolver.ts` injects the access token as the
   OpenAI-compatible `apiKey`; refresh is handled by the credential service.

## Console

The console is part of the control plane, not a separate deployment. It is a SolidJS SPA whose API
uses the browser SSO session and organization role instead of the admin token. Every mutation is
CSRF-protected and audited as the signed-in person.

- Owners manage owners, admins, members, models, policies, SSO, upstream, sessions, and audit.
- Admins manage everything except owner membership.
- Members see their own access and revoke their own devices.

The deployment serves one shell and one set of content-hashed assets, with a strict CSP. See
[`08-console.md`](08-console.md).

## Auth

- Access tokens are Ed25519 JWTs with `sub`, `org`, `sid`, `jti`, `iss`, `aud`, and `exp`.
- The control plane signs; the gateway verifies locally. Key rotation uses `kid` and JWKS.
- Refresh tokens are opaque, stored as SHA-256 hashes, rotate on every use, and revoke the family on
  reuse.
- Access TTL defaults to five minutes. Session revocation writes `ballm:revoked:<sid>` to Redis and
  marks the session revoked in Postgres.

## Data

- PostgreSQL is the durable source of truth.
- `audit_events` and `usage_events` are partitioned by month; the migration runner creates the
  current and next two partitions, with a DEFAULT partition for safety.
- Redis caches org catalogs, rate-limit counters, and revocations. It is optional for a single
  replica but required for global limits and immediate multi-replica revocation.
- SSO client secrets and per-org upstream keys are sealed with AES-256-GCM.

## Multi-region

```text
region A: control plane + gateway + Redis + Postgres primary
region B: gateway + Redis + Postgres read replica
region C: gateway + Redis + Postgres read replica
```

- All writes go to the primary; gateways read from regional replicas.
- The control plane reads the primary for sessions, memberships, console data, and delivered
  config, so sign-in and policy changes are visible on the next request instead of waiting for
  replica lag. Gateways remain replica readers.
- JWT verification is local, so auth adds no cross-region hop.
- Catalog changes publish `ballm:invalidate`; gateways clear local and Redis caches.
- Rate limits are per region unless Redis is replicated globally.
- Revocation is immediate in the region that handled it and bounded by the access TTL elsewhere
  unless the revocation cache is replicated.

## Why a fork

Upstream already supports integrations and remote config, so most client behavior is a plugin. The
fork is needed to:

- compile the plugin into the binary so a user cannot disable it;
- add it to the guarded plugin set and remove the upstream Console provider;
- brand the CLI and desktop app;
- point updates at Ballm-controlled artifacts;
- ship managed policy through the installer.

## Repository boundaries

- `packages/core/src/ballm/` is the only runtime client code added to upstream.
- `ballm/backend/` is the platform: `packages/platform`, `services/control-plane`,
  `services/gateway`, `console`, migrations, Helm.
- `ballm/managed/`, `ballm/distro/`, and `ballm/docs/` are packaging and operations artifacts.

## Client storage

Client credentials remain in OpenCode's credential store. The backend never receives the refresh
cookie; it only sees refresh-token grants from the CLI or desktop client.

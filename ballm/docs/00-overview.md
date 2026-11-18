# Overview

## Goal

Give every Ballm developer a coding agent that can only reach Ballm-approved models, while giving
the platform team central control over catalog, policy, usage, and identity.

## Product surface

- Terminal client (`ballm`, built from `packages/cli`)
- Desktop app (built from `packages/desktop`)
- Control plane and model gateway (`ballm/backend`)
- Same OpenCode agents, tools, sessions, and project configuration

## Non-goals for v1

- Replacing the agent runtime or tool layer
- Public distribution or self-service signup
- Billing and chargeback

## Control model

Ballm Code enforces four layers; each layer is meaningful on its own:

1. **Gateway** — inference requires a Ballm-issued JWT. Upstream model keys stay server-side, and
   each organization has its own model allowlist and upstream route.
2. **Remote config** — the client receives providers, models, MCP servers, and policies from
   `/api/v2/config`.
3. **Managed policy** — a root-owned file (or MDM profile) denies every provider and integration
   except `ballm`. It outranks user and project configuration.
4. **Distribution** — the Ballm integration is compiled in and guarded, and the app updates from the
   Ballm feed.

Local enforcement is best-effort against a determined user with root access. The gateway, network
egress rules, and device management are the authoritative controls.

## Platform model

- **PostgreSQL** is the source of truth. No SQLite in the server path.
- **Control plane and gateway are separate stateless services.** They scale independently.
- **Multi-org by default.** Users belong to organizations; models, policies, SSO, and upstream
  credentials are per organization.
- **SSO from day one.** OIDC authorization code + PKCE, with group-to-role mapping.
- **Multi-region ready.** Gateways read from regional Postgres replicas and validate JWTs locally.

## Success criteria

- A new developer can install Ballm Code, sign in through the browser, and run a session in under
  five minutes.
- No model request leaves the machine to a host other than the Ballm gateway.
- Removing the integration or switching models cannot be done from project config.
- Offboarding revokes access without touching the developer's machine.
- A region can lose its control plane and keep serving inference with cached catalogs and local JWT
  verification until the access token expires.

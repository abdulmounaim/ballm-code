# Ballm Code

Ballm Code is the internal, opinionated distribution of [OpenCode](https://github.com/anomalyco/opencode).
It keeps OpenCode's agent, TUI, and desktop app, but replaces the model and account layer with the Ballm
control plane:

- users link their client through browser device authorization backed by their organization's OIDC
  identity provider;
- the only usable model provider is the Ballm gateway;
- model catalogs, remote MCP servers, and organization policies are delivered by the backend;
- managed policy files make the Ballm-only configuration survive user and project config.

This directory contains everything Ballm-specific. The rest of the repository is the upstream OpenCode
monorepo, kept as close to upstream as possible so upgrades stay cheap.

## Layout

| Path | Purpose |
| --- | --- |
| `packages/schema/src/brand.ts` | Single source for product name, app ID, URLs, feeds |
| `packages/core/src/ballm/` | Client integration: OAuth, remote config, provider wiring |
| `ballm/backend/` | PostgreSQL platform: control plane, gateway, console, migrations, Helm |
| `ballm/managed/` | Managed policy files for Linux, macOS, and Windows |
| `ballm/distro/` | Branding source, icon generator, installers, build/release scripts |
| `ballm/docs/` | Architecture, backend contract, enforcement, release, runbook, console |
| `ballm/tests/` | Cross-cutting policy and end-to-end checks |

## Quick start

```sh
# from the repository root
make -C ballm bootstrap     # install root, backend, and distro dependencies
cd ballm/backend && bun run keys   # Ed25519 keys + encryption key for .env
make -C ballm compose-up    # Postgres, Redis, migrations, control plane, gateway
make -C ballm dev           # start the Ballm Code TUI against this checkout
```

In the TUI, connect the `Ballm` integration. The approval page is served by the control plane at
`http://localhost:8787/console/device`; it resolves the organization from the work email and hands
off to SSO. The management console is at `http://localhost:8787/console/`, with overview, members,
models, policies, identity, upstream, sessions, usage, and audit. For local development, configure
an OIDC connection through the console or admin API, or enable `BALLM_DEV_AUTH=1` and use
`POST /auth/dev/login`.

See `docs/05-development.md` for prerequisites, environment variables, SSO setup, and test commands.
The platform itself is documented in `ballm/backend/README.md`.

## Branding

The desktop, web, TUI, and installer read from `packages/schema/src/brand.ts`.

```sh
make -C ballm icons
make -C ballm brand-audit
```

Source art lives in `ballm/distro/branding/source/`. The current files are deliberately marked
placeholders; replace them and rerun the generator. The brand audit fails if a packaged identity,
update feed, icon, or managed-policy statement drifts from the Ballm-owned values.

## Upstream

The repository remote layout is:

```text
upstream  https://github.com/anomalyco/opencode.git
origin    <internal Ballm repository>
```

The pinned upstream base is recorded in `upstream.lock`. Do not edit files outside `ballm/` and the
small registration points in `packages/` unless the change is intentional and documented in
`CHANGELOG.md`.

## Status

- Platform: separate control plane and gateway, PostgreSQL, Redis, JWT access tokens, rotating
  refresh tokens, multi-org SSO, admin API, usage recording, Docker Compose, Helm.
- Console: SolidJS admin and account UI served by the control plane, with cookie auth, CSRF,
  server-side RBAC, CSP, light/dark themes, and a device approval flow.
- Client integration and provider routing: implemented and tested end to end.
- Managed policy: implemented.
- Desktop/web/TUI branding: implemented with placeholder art and enforced by `make -C ballm brand-audit`.
- Provider surface: Ballm is the only registered account provider; the upstream Console plugin is not
  part of the build.
- Signed macOS/Windows/Linux release: workflow and configuration ready; certificates, update host, and
  final art are external inputs.

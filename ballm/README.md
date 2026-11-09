# Ballm Code

Ballm Code is the internal, opinionated distribution of [OpenCode](https://github.com/anomalyco/opencode).
It keeps OpenCode's agent, TUI, and desktop app, but replaces the model and account layer with the Ballm
control plane:

- users link their client with browser device-code OAuth;
- the only usable model provider is the Ballm gateway;
- model catalogs, remote MCP servers, and organization policies are delivered by the backend;
- managed policy files make the Ballm-only configuration survive user and project config.

This directory contains everything Ballm-specific. The rest of the repository is the upstream OpenCode
monorepo, kept as close to upstream as possible so upgrades stay cheap.

## Layout

| Path                       | Purpose                                                   |
| -------------------------- | --------------------------------------------------------- |
| `packages/core/src/ballm/` | Client integration: OAuth, remote config, provider wiring |
| `ballm/backend/`           | Independently deployable control plane and gateway        |
| `ballm/managed/`           | Managed policy files for Linux, macOS, and Windows        |
| `ballm/distro/`            | Branding, installers, build and release scripts           |
| `ballm/docs/`              | Architecture, backend contract, enforcement, runbook      |
| `ballm/tests/`             | Cross-cutting end-to-end fixtures and tests               |

## Quick start

```sh
# from the repository root
make -C ballm bootstrap     # install root and backend dependencies
make -C ballm backend       # start the control plane on :8787
make -C ballm dev           # start the OpenCode TUI against this checkout
```

In the TUI, connect the `Ballm` integration. The device-flow URL is served by the local control plane.
For local development, approve the code at `http://localhost:8787/device` or call
`POST /auth/device/approve` directly.

See `docs/05-development.md` for prerequisites, environment variables, and test commands.

## Upstream

The repository remote layout is:

```text
upstream  https://github.com/anomalyco/opencode.git
origin    <internal Ballm repository>
```

The pinned upstream base is recorded in `upstream.lock`. Do not edit files outside
`ballm/` and the small registration points in `packages/core/src/` unless the change is intentional
and documented in `CHANGELOG.md`.

## Status

Scaffold: device flow, remote config, gateway proxy, managed policy artifacts, and client plugin are
implemented. Desktop branding, code signing, and production SSO are wired as explicit follow-up
steps in `docs/06-release.md`.

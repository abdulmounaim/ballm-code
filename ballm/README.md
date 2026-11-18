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

| Path | Purpose |
| --- | --- |
| `packages/schema/src/brand.ts` | Single source for product name, app ID, URLs, feeds |
| `packages/core/src/ballm/` | Client integration: OAuth, remote config, provider wiring |
| `ballm/backend/` | Independently deployable control plane and gateway |
| `ballm/managed/` | Managed policy files for Linux, macOS, and Windows |
| `ballm/distro/` | Branding source, icon generator, installers, build/release scripts |
| `ballm/docs/` | Architecture, backend contract, enforcement, release, runbook |
| `ballm/tests/` | Cross-cutting policy and end-to-end checks |

## Quick start

```sh
# from the repository root
make -C ballm bootstrap     # install root, backend, and distro dependencies
make -C ballm backend       # start the control plane on :8787
make -C ballm dev           # start the Ballm Code TUI against this checkout
```

In the TUI, connect the `Ballm` integration. The device-flow URL is served by the local control plane.
For local development, approve the code at `http://localhost:8787/device` or call
`POST /auth/device/approve` directly.

See `docs/05-development.md` for prerequisites, environment variables, and test commands.

## Branding

The desktop, web, TUI, and installer read from `packages/schema/src/brand.ts`.

```sh
cd ballm/distro
bun run icons
```

Source art lives in `ballm/distro/branding/source/`. The current files are deliberately marked
placeholders; replace them and rerun the generator.

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

- Backend device flow, token rotation, remote config, and gateway: implemented and tested.
- Client integration and provider routing: implemented and tested end to end.
- Managed policy: implemented.
- Desktop/web/TUI branding: implemented with placeholder art.
- Signed macOS/Windows/Linux release: workflow and configuration ready; certificates, update host, and
  final art are external inputs.

# Development

## Prerequisites

- Bun `1.4.4` (the version pinned by the repository)
- Node 22+ for tooling that still expects it
- Git
- An OpenAI-compatible upstream for gateway testing, or `BALLM_DEV_ECHO=1`

```sh
curl -fsSL https://bun.sh/install | bash
```

## First run

```sh
cd /path/to/ballm-code
make -C ballm bootstrap

# terminal 1
make -C ballm backend

# terminal 2
make -C ballm dev
```

Open the TUI, run the integration dialog, choose **Ballm**, and approve the code in the browser at
`http://localhost:8787/device`.

The desktop app uses the same integration:

```sh
make -C ballm icons      # regenerate icons from branding/source
cd packages/desktop && bun run dev
```

## Backend environment

Copy `ballm/backend/.env.example` to `ballm/backend/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port |
| `BALLM_PUBLIC_URL` | `http://localhost:8787` | URL used in config and device links |
| `BALLM_DB` | `./ballm.db` | SQLite file |
| `BALLM_ORG_ID` | `org_local` | Default org |
| `BALLM_ORG_NAME` | `Local` | Default org name |
| `BALLM_MODELS` | `ballm-fast:Ballm Fast` | `id:Display Name` pairs |
| `UPSTREAM_BASE_URL` | unset | OpenAI-compatible upstream, including `/v1` |
| `UPSTREAM_API_KEY` | unset | Upstream key |
| `BALLM_DEV_ECHO` | unset | `1` returns a fake completion instead of proxying |
| `BALLM_ALLOW_DEV_APPROVE` | `1` | Enables `POST /auth/device/approve` |

## Client environment

| Variable | Purpose |
| --- | --- |
| `BALLM_SERVER` | Override the integration server URL for local development |
| `BALLM_DISABLE_FREE_MODELS` | Reserved for the fork bootstrap |

The integration form exposes a hidden `server` field, so a user can point one connection at a staging
backend without rebuilding.

## Branding

Brand constants live in `packages/schema/src/brand.ts`. Source art lives in
`ballm/distro/branding/source/`.

```sh
cd ballm/distro
bun install
bun run icons
```

The generator writes `packages/desktop/icons/{dev,beta,prod}` and the favicon/social assets under
`packages/ui/src/assets` and `packages/app/public`. The current art is a placeholder; replacing the
three source files is the only step needed when design delivers final artwork.

## CLI

The published package still exposes `opencode`; the fork adds `ballm` as an alias and the installer
writes `~/.ballm/bin/ballm`.

```sh
make -C ballm build-cli
make -C ballm build-desktop
```

On a memory-constrained machine, set `BALLM_SKIP_WEB_UI=1` when building the CLI. The desktop
bundles its own renderer; the skipped asset is the CLI's pairing web UI.

## Tests

```sh
make -C ballm test        # backend unit tests
make -C ballm typecheck   # packages/core typecheck
make -C ballm verify      # backend, policy, core, schema, managed policy
```

End-to-end policy and device-flow tests live in `ballm/tests/e2e`. They are intentionally outside
the upstream test runner so upstream CI stays untouched.

## Adding a model

1. Add the ID and display name to `BALLM_MODELS` on the backend, or to the org catalog once the
   catalog store is introduced.
2. Restart the backend (or call the config reload endpoint once implemented).
3. In the client, press the integration refresh or wait for the periodic poll.

Never hard-code a model in the client plugin.

## Upstream sync

```sh
make -C ballm sync
```

The script fetches `upstream/dev`, shows the pinned and candidate commits, and rebases
`internal/main`. Resolve conflicts only in the registration points; `packages/core/src/ballm/` is
ours and should not conflict.

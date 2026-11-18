# Release

## Versioning

Ship **plain semver**: `2.3.0`, `2.3.1`, `2.4.0`. Electron's updater treats a `-ballm.N` suffix as a
prerelease, and the updater is configured with `allowPrerelease = false`, so suffixed builds would
never be offered. Keep Ballm-specific build metadata in this changelog and in `release.json`.

Tags are `v2.3.0`. The upstream base remains in `upstream.lock`.

## Artifacts

| Artifact | Source | Destination |
| --- | --- | --- |
| CLI binaries | `./distro/scripts/build-cli.sh` | internal artifact store |
| npm packages | `bun run script/pack.ts` | internal registry (optional) |
| Desktop installers | `./distro/scripts/build-desktop.sh` | `dist/desktop` |
| Backend image | `ballm/backend/Dockerfile` (includes the console build) | internal registry |
| Backend chart | `ballm/backend/helm/ballm-code` | internal Helm repository |
| Managed policy | `ballm/managed/` | packaged with the installer |
| Update manifests | electron-builder `latest*.yml` | Ballm update feed |

## Client build

```sh
make -C ballm build-cli
make -C ballm build-desktop
make -C ballm release TAG=2.3.0
```

`build-desktop.sh` builds the CLI first when it is missing. Production desktop builds bundle
`packages/cli/dist`, so the CLI must be built for the same target.

## Backend release

```sh
cd ballm/backend
docker build --build-arg SERVICE=control-plane -t registry.ballm.internal/ballm/backend:2.3.0 .
docker push registry.ballm.internal/ballm/backend:2.3.0
```

One image contains both services; the deployments select one with `BALLM_SERVICE`.

The Helm chart runs migrations as a `pre-install,pre-upgrade` Job. It expects:

- `ballm-platform` secret with `DATABASE_URL`, `REDIS_URL`, `BALLM_ENCRYPTION_KEY`,
  `BALLM_ADMIN_TOKEN`
- `ballm-jwt` secret with `jwt-private.pem` and `jwt-public.pem`
- external Postgres primary and, per region, a read replica and Redis/Valkey

```sh
helm upgrade --install ballm ./helm/ballm-code -f values.production.yaml
```

Roll gateways before or after the control plane only when the contract is backward compatible.
Database migrations must be additive within a release; remove old columns in a later release.

## Desktop branding

Branding lives in:

- `packages/schema/src/brand.ts` — names, IDs, URLs, feed, CLI paths
- `ballm/distro/branding/source/` — mark, wordmark, app icon
- `ballm/distro/scripts/icons.ts` — generates every icon size

Regenerate icons after replacing the source art:

```sh
make -C ballm icons
make -C ballm brand-audit
```

The packaged app uses `com.ballm.code`, `Ballm Code`, `ballm://`, and `ballm-code-*` artifacts. The
dev channel uses `com.ballm.code.dev` and the dev feed.

## Update feed

Generic static feed per channel:

```text
https://updates.ballm.internal/desktop/dev/
https://updates.ballm.internal/desktop/beta/
https://updates.ballm.internal/desktop/prod/
```

Each feed needs `latest.yml` (Windows), `latest-mac.yml`, `latest-linux.yml`, and
`latest-linux-arm64.yml`, plus the installers and blockmaps. The release workflow uploads them when
the `publish` input is enabled.

Optional: deploy the upstream `services/update` Cloudflare Worker for staged rollouts and minimum
versions. It needs a `ballm` distribution entry and a Ballm D1/R2 deployment.

## Signing

- macOS: Developer ID Application certificate, then notarization. Set `CSC_LINK`,
  `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. The workflow
  sets `OPENCODE_NOTARIZE=1` for macOS.
- Windows: Azure Artifact Signing (recommended) or a traditional OV/EV certificate via
  `CSC_LINK`/`CSC_KEY_PASSWORD`. `verifyUpdateCodeSignature` is enabled, so `publisherName` must
  match the certificate subject exactly.
- Linux: publish checksums and a detached GPG signature alongside the AppImage.

Without the three identities, only local unsigned Linux builds are possible.

## Multi-region rollout

1. Apply migrations once against the primary.
2. Deploy the control plane in the primary region.
3. Deploy gateways in each region with `DATABASE_READ_URL` pointing at that region's replica and a
   regional Redis/Valkey.
4. Verify `/.well-known/jwks.json` is reachable from every region, or mount the public key.
5. Run a smoke request against each regional gateway before moving traffic.

## Release checklist

- [ ] `make -C ballm verify` passes, including the console typecheck and production build
- [ ] `/console/` loads through the ingress with its CSP headers intact
- [ ] `make -C ballm brand-audit` passes
- [ ] `upstream.lock` matches the intended base
- [ ] managed policy statements reviewed
- [ ] backend migrations reviewed and destructive changes deferred
- [ ] backend image and Helm chart published
- [ ] `DATABASE_READ_URL` and regional Redis configured
- [ ] signing identities present
- [ ] update feed serves the new `latest*.yml`
- [ ] previous release retained for rollback
- [ ] audit and revocation tested

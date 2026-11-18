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
| Managed policy | `ballm/managed/` | packaged with the installer |
| Update manifests | electron-builder `latest*.yml` | Ballm update feed |

## Build

```sh
make -C ballm build-cli
make -C ballm build-desktop
make -C ballm release TAG=2.3.0
```

`build-desktop.sh` builds the CLI first when it is missing. Production desktop builds bundle
`packages/cli/dist`, so the CLI must be built for the same target.

## Desktop branding

Branding lives in:

- `packages/schema/src/brand.ts` — names, IDs, URLs, feed, CLI paths
- `ballm/distro/branding/source/` — mark, wordmark, app icon
- `ballm/distro/scripts/icons.ts` — generates every icon size

Regenerate icons after replacing the source art:

```sh
cd ballm/distro && bun run icons
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
- Windows: code-signing certificate via `CSC_LINK`/`CSC_KEY_PASSWORD`; `verifyUpdateCodeSignature`
  is enabled.
- Linux: publish checksums and a detached GPG signature alongside the AppImage.

Without the three identities, only local unsigned Linux builds are possible.

## Release checklist

- [ ] `make -C ballm verify` passes
- [ ] `upstream.lock` matches the intended base
- [ ] managed policy statements reviewed
- [ ] brand audit shows no unintended upstream names or feeds
- [ ] desktop `publish` URL points at Ballm
- [ ] signing identities present
- [ ] update feed serves the new `latest*.yml`
- [ ] previous release retained for rollback
- [ ] audit and revocation tested

# Changelog

All notable changes to the Ballm Code distribution. Upstream changes are tracked separately by the
pinned base in `upstream.lock`.

## Unreleased

### Added

- Project layout under `ballm/` with backend, managed policy, distro, docs, and tests.
- `packages/core/src/ballm/` client integration: device-code OAuth, remote config, provider wiring.
- Ballm control plane scaffold: device flow, token rotation, user/org directory, `/api/v2/config`,
  and authenticated OpenAI-compatible gateway proxy.
- Managed policy files for Linux, macOS (MDM plist), and Windows.
- Build, sync, verify, and release scripts.

### Changed

- `packages/core/src/plugin/provider.ts` registers the Ballm provider plugin.
- `packages/core/src/plugin/internal.ts` marks the Ballm plugin as guarded so configuration cannot
  remove it.

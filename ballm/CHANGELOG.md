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
- `packages/schema/src/brand.ts` as the single source for product identity.
- Placeholder Ballm mark, wordmark, app icon, and a cross-platform icon generator.

### Changed

- Desktop identity is now `Ballm Code` / `com.ballm.code`, with `ballm://` deep links and
  `ballm-code-*` artifacts.
- Desktop, web, and TUI logos and wordmarks are Ballm-branded.
- The About page is Ballm-specific and keeps the OpenCode MIT attribution.
- Updater feeds, user agent, changelog URL, and release workflow point at Ballm.
- The desktop CLI installer writes `~/.ballm/bin/ballm`.
- Brand names were replaced across the English and translated UI strings.
- `packages/core/src/plugin/provider.ts` registers the Ballm provider plugin.
- `packages/core/src/plugin/internal.ts` marks the Ballm plugin as guarded so configuration cannot
  remove it.

### Notes

- Internal identifiers intentionally remain OpenCode-named: `@opencode/*` packages, `OPENCODE_*`
  environment variables, config/data directories, the service registration, and the bundled
  `opencode-cli` binary.
- Final brand artwork, signing certificates, and the update host are external inputs. The current
  assets are placeholders.

# Changelog

All notable changes to the Ballm Code distribution. Upstream changes are tracked separately by the
pinned base in `upstream.lock`.

## Unreleased

### Added

- PostgreSQL platform backend split into a control plane and gateway, with a shared platform package.
- OIDC SSO with PKCE, per-organization SSO connections, group-to-role mapping, and browser sessions.
- Multi-org data model: organizations, memberships, per-org model catalogs, policies, and upstream
  credentials.
- Ed25519 JWT access tokens, JWKS, rotating refresh tokens with reuse detection, and Redis-backed
  revocation.
- Admin API for orgs, members, models, policies, SSO, and upstream configuration.
- Gateway rate limiting, model rewriting, streaming pass-through, SSE usage capture, and partitioned
  audit/usage tables.
- Docker Compose stack and a Helm chart for on-prem/Kubernetes, including a migration Job.
- Browser console at `/console/`: SolidJS + Vite + Tailwind, light/dark themes, command menu,
  overview, members, models, policies, SSO, upstream, sessions, usage, audit, and account screens.
- Device approval moved into the console; `/device` redirects to `/console/device`.
- Console API with browser-cookie auth, per-session CSRF tokens, origin checks, server-side RBAC,
  strict CSP and security headers, secret redaction, and an audit event for every mutation.
- `make -C ballm brand-audit` and `ballm/distro/scripts/brand-audit.ts`: enforce Ballm app IDs,
  update feeds, deep links, generated icons, shell titles, and managed-policy statements.
- Project layout under `ballm/` with backend, managed policy, distro, docs, and tests.
- `packages/core/src/ballm/` client integration: device-code OAuth, remote config, provider wiring.
- Ballm control plane scaffold: device flow, token rotation, user/org directory, `/api/v2/config`,
  and authenticated OpenAI-compatible gateway proxy.
- Managed policy files for Linux, macOS (MDM plist), and Windows.
- Build, sync, verify, and release scripts.
- `packages/schema/src/brand.ts` as the single source for product identity.
- Placeholder Ballm mark, wordmark, app icon, and a cross-platform icon generator.

### Changed

- The SQLite backend was replaced by PostgreSQL. The old single-process server is gone; the client
  contract is unchanged.
- The control plane is the only writer; gateways read from regional replicas and validate JWTs
  locally.
- SSO secrets and per-org upstream keys are encrypted with AES-256-GCM at rest.
- The upstream OpenCode Console provider is no longer registered in the Ballm build; the Ballm
  integration replaces it, and only Ballm plus policy enforcement are guarded.
- Desktop identity is now `Ballm Code` / `com.ballm.code`, with `ballm://` deep links and
  `ballm-code-*` artifacts.
- Desktop, web, and TUI logos and wordmarks are Ballm-branded.
- The About page is Ballm-specific and keeps the OpenCode MIT attribution.
- Updater feeds, user agent, changelog URL, and release workflow point at Ballm.
- The desktop CLI installer writes `~/.ballm/bin/ballm`.
- Brand names were replaced across the English and translated UI strings.
- Ballm-specific voice prompts, model labels, desktop perf fixtures, and AppStream metadata no longer
  use the upstream identity.
- `packages/core/src/plugin/provider.ts` registers the Ballm provider plugin.
- `packages/core/src/plugin/internal.ts` marks the Ballm plugin as guarded so configuration cannot
  remove it.

### Notes

- Internal identifiers intentionally remain OpenCode-named: `@opencode/*` packages, `OPENCODE_*`
  environment variables, config/data directories, the service registration, and the bundled
  `opencode-cli` binary.
- Final brand artwork, signing certificates, and the update host are external inputs. The current
  assets are placeholders.

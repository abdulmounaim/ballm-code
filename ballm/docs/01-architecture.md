# Architecture

## Components

```text
+---------------------+          device flow          +----------------------+
|  Ballm Code client  | <----------------------------> |  Ballm control plane |
|  (TUI / desktop)    |                                |  /auth/device/*      |
|                     |          remote config         |  /api/v2/config      |
|  BallmPlugin        | <----------------------------> |  /api/user, /api/orgs|
|  - OAuth            |                                +----------+-----------+
|  - remote config    |                                           |
|  - provider wiring  |          inference                          |
|                     | -----------------------------> +-----------v-----------+
+---------------------+                                |  Ballm LLM gateway    |
                                                       |  /v1/* -> upstream    |
                                                       +----------------------+
```

## Client request path

1. `BallmPlugin` registers integration `ballm` with a device OAuth method.
2. The user runs `opencode auth login` (or the TUI integration dialog) and approves the code in a
   browser.
3. The credential stores access, refresh, expiry, and `orgID` metadata.
4. The plugin fetches `/api/v2/config` with the access token and `X-Org-Id`.
5. The response is wrapped as an integration config document and applied through
   `ConfigProviderPlugin.integrate`.
6. The provider record is bound to the connection. While signed out, no Ballm provider exists.
7. Inference uses the provider's base URL. `model-resolver.ts` injects the OAuth access token as the
   OpenAI-compatible `apiKey`; refresh is handled by the credential service.

## Why a fork

Upstream already supports integrations and remote config, so most behavior is a plugin. The fork is
needed to:

- compile the plugin into the binary so a user cannot disable it;
- add it to the guarded plugin set;
- brand the CLI and desktop app;
- point updates at Ballm-controlled artifacts;
- ship managed policy through the installer.

## Repository boundaries

- `packages/core/src/ballm/` is the only runtime code added to upstream. It depends on existing core
  services and should not require changes to other packages.
- `ballm/backend/` is a separate deployable with its own dependency tree and lockfile.
- `ballm/managed/`, `ballm/distro/`, and `ballm/docs/` are packaging and operations artifacts.

## State and storage

- Client credentials live in OpenCode's credential store (SQLite under the OpenCode data directory).
- Gateway tokens are opaque; only their SHA-256 hashes are stored server-side.
- Refresh tokens rotate on every use.
- Audit rows record sign-in, refresh, config reads, and gateway requests.

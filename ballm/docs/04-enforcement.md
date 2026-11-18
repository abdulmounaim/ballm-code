# Enforcement

## Policy precedence

OpenCode loads configuration layers in this order, with policies evaluated earliest-loaded-first:

1. managed policy (system directory or MDM)
2. integration documents delivered by a connection
3. well-known documents
4. global user config
5. explicit and project config
6. inline content

Managed policy is therefore the only layer that can outrank Ballm-delivered policy. A project file
cannot widen access or strip the Ballm config document.

## Managed files

| Platform | Path                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| Linux    | `/etc/opencode/opencode.jsonc`                                                         |
| macOS    | `/Library/Application Support/opencode/opencode.jsonc` or MDM `ai.ballm.managed.plist` |
| Windows  | `%ProgramData%\opencode\opencode.jsonc`                                                |

Install them root-owned and read-only. On macOS prefer the MDM profile so the user cannot edit the
file at all.

## Required statements

The shipped files deny everything, then allow only Ballm:

- `provider.use`: deny `*`, allow `ballm`
- `integration.connect`: deny `*`, allow `ballm`
- `integration.use`: deny `*`, allow `ballm*` (the `*` covers the `#<account>` suffix)
- `mcp.use`: deny `*`, allow explicitly approved prefixes
- `websearch.use`: deny `*` until Ballm search is configured
- `plugin.use`: deny `*` so project config cannot load arbitrary code

Note that denying `integration.use` also removes the providers it supplied. The `ballm*` allow is
required for the integration document to load.

## Guarded plugin

`BallmPlugin.id` is added to the guarded set in `packages/core/src/plugin/internal.ts` alongside
`opencode.config.policy`. Configuration plugin removals cannot disable either one.

The upstream OpenCode Console provider plugin is not registered in this build. The Ballm integration
replaces it, so there is no second built-in account provider to disable or fall back to.

## What is not enforceable locally

A user with root can edit managed files or run a stock OpenCode binary. Treat the client policy as a
guardrail, not DRM. The authoritative controls are:

- gateway tokens scoped to user and org;
- model allowlists per org;
- network egress rules that block model vendors;
- MDM application allowlists;
- audit review of gateway requests.

## Verification

Run the policy checks in `ballm/tests/e2e` before a release:

- a project config that adds `providers.openai` still leaves `openai` unavailable;
- `--model openai/gpt-*` fails;
- removing the Ballm plugin from config has no effect;
- with the backend offline, only managed policy remains and no other provider is usable;
- revoking the token makes the Ballm provider disappear on the next refresh.

# Client integration

## Files

| File                                 | Responsibility                                               |
| ------------------------------------ | ------------------------------------------------------------ |
| `packages/core/src/ballm/index.ts`   | Plugin definition and orchestration                          |
| `packages/core/src/ballm/product.ts` | Names, IDs, hosts, and defaults                              |
| `packages/core/src/ballm/schemas.ts` | Device, token, user, org, and error schemas                  |
| `packages/core/src/ballm/oauth.ts`   | Device authorization, polling, refresh, credential creation  |
| `packages/core/src/ballm/remote.ts`  | `/api/v2/config` fetch and integration document construction |
| `packages/core/src/ballm/access.ts`  | Server URL normalization and auth headers                    |

Registration points:

- `packages/core/src/plugin/provider.ts` adds `BallmPlugin` to `ProviderPlugins`.
- `packages/core/src/plugin/internal.ts` adds `BallmPlugin.id` to `guarded`.

## Lifecycle

1. The plugin registers the `ballm` integration and its `device` OAuth method.
2. It reads the active connection and resolves the stored credential.
3. It fetches the remote config and builds a `ConfigIntegration.Document`.
4. It applies the document through `ConfigProviderPlugin.integrate`, which binds the provider to the
   connection and marks it enabled.
5. It reloads providers so the model catalog updates without a restart.
6. On credential switch, rollback, or periodic poll, it repeats steps 2–5.
7. On 401, it reports `needs_auth` on the connection and stops offering the provider.

## Token injection

No custom HTTP client is needed. `packages/core/src/model-resolver.ts` maps an OAuth credential to
provider settings:

- OpenAI-compatible packages receive `{ apiKey: accessToken }`
- Anthropic packages receive `{ authToken }`
- Google Vertex receives `{ accessToken }`

Refresh is owned by the credential service through the integration's `refresh` callback.

## Provider rules

- Provider ID is always `ballm`.
- Package is `@opencode/ai/providers/openai-compatible`.
- Base URL is the Ballm gateway plus `/v1`.
- Models and limits come from the remote config. Do not hard-code model IDs in the client.
- The provider has no activation fallback. Signed out means no provider.

## Adding remote MCP servers later

Add `mcp.servers` to the backend response using only `type: "remote"` entries. The client's
`ConfigIntegration.make` already filters local servers out, so a compromised config cannot run a
command on the developer machine.

## Adding org instructions and skills later

Follow the Console plugin's `InstructionDiscovery` and `Skill.Service` transforms. Keep the download
paths and headers separate from the provider code, and tag cached items by account and org so an
account switch hides them immediately.

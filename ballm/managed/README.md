# Managed policy

These files are the client-side floor. Managed policy is evaluated before integration, user, and
project configuration, so a developer cannot widen access by editing `opencode.json`.

## Install

| Platform | Source                         | Destination                                  |
| -------- | ------------------------------ | -------------------------------------------- |
| Linux    | `linux/opencode.jsonc`         | `/etc/opencode/opencode.jsonc`               |
| macOS    | `macos/ai.ballm.managed.plist` | MDM managed preferences (`ai.ballm.managed`) |
| Windows  | `windows/opencode.jsonc`       | `%ProgramData%\opencode\opencode.jsonc`      |

The destination files must be readable by the client but not writable by the developer. On Linux and
Windows the installer writes them as root/administrator. On macOS deploy the plist through MDM; a
root-owned file under `/Library/Application Support/opencode/` works only if the developer account
cannot sudo.

## Rules

- Keep the statement order: broad denies first, Ballm allows after them. Later matching statements
  win within the file, and managed files win across files.
- `integration.use` must allow `ballm*`; the `*` covers the `#<account>` suffix on connected use.
- Denying `plugin.use` blocks externally configured plugins. Verify that your teams do not rely on a
  plugin before tightening this.
- Do not add `tool.use` denials here without a product decision; they can break routine workflows.

## Verification

Run from the repository root with a test project that tries to add another provider:

```sh
opencode api get /api/integration/list
opencode api get /api/provider/list
```

The only provider and integration should be `ballm`. A project-level `opencode.json` that adds
`providers.openai` must not make OpenAI selectable.

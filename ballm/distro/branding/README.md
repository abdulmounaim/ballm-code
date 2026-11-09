# Branding

Expected assets:

| Platform | File               | Notes                         |
| -------- | ------------------ | ----------------------------- |
| macOS    | `macos/icon.icns`  | 1024px source, Apple template |
| Windows  | `windows/icon.ico` | 256px multi-size              |
| Linux    | `linux/icon.png`   | 512px                         |

Branding is not applied yet. When it is, update these together:

- `packages/desktop/electron-builder.config.ts`: `APP_IDS`, `appId`, `productName`, icons,
  `publish` URL, Linux executable and desktop entry.
- `packages/cli/package.json`: `bin` names and package name.
- `packages/core/src/ballm/product.ts`: display name, IDs, default host.
- `ballm/distro/installer/*`: artifact URLs and installed command name.

Keep the integration ID and provider ID as `ballm`. Renaming them changes credentials, policies, and
remote config, and requires a migration.

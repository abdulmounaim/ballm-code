# Branding

Product identity has one source: [`packages/schema/src/brand.ts`](../../../packages/schema/src/brand.ts).
Desktop, web, TUI, the installer, and the release workflow read from it.

## Artwork

Source art lives in `source/`:

| File | Purpose |
| --- | --- |
| `mark.svg` | Square mark, single color plus transparent background |
| `wordmark.svg` | Horizontal wordmark using `currentColor` |
| `app-icon.svg` | 1024×1024 app icon with background |

These files are placeholders until design delivers final artwork. Replace them, then regenerate every
derived asset:

```sh
make -C ballm icons
make -C ballm brand-audit
```

## Generated outputs

The icon generator (`../scripts/icons.ts`) writes:

- `packages/desktop/icons/{dev,beta,prod}/` — macOS, Windows, Linux, Android, and iOS sizes
- `packages/desktop/resources/icons/` — the channel copied by the desktop build
- `packages/ui/src/assets/favicon/` and `packages/app/public/` — web favicons, manifest icons, and
  the social preview

The desktop build copies the selected channel with `packages/desktop/script/copy-icons.ts` and
generates the AppStream metadata with `copy-metainfo.ts`.

## Invariants

Do not change these without a migration:

- app IDs `com.ballm.code`, `com.ballm.code.beta`, `com.ballm.code.dev`
- deep-link scheme `ballm`
- update feed `https://updates.ballm.internal/desktop/<channel>/`
- integration and provider ID `ballm`
- CLI install directory `~/.ballm` and command `ballm`

`make -C ballm brand-audit` fails when a packaged identity, feed, icon, or managed-policy statement
drifts from these rules. It also checks that user-facing shell titles and manifests no longer carry
the upstream identity.

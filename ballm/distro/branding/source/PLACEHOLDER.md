# Placeholder brand assets

These files are deliberately temporary. They exist so the desktop, CLI, installer, and release
pipeline can be built and reviewed before design delivers final artwork.

Replace them, then regenerate the derived assets:

```sh
make -C ballm icons
make -C ballm brand-audit
```

Design should provide:

- `source/mark.svg` — square app mark, single color plus transparent background
- `source/wordmark.svg` — horizontal wordmark using `currentColor`
- `source/app-icon.svg` — 1024×1024 app icon with background

Generated outputs land in `packages/desktop/icons/{dev,beta,prod}`, `packages/desktop/resources/icons`,
`packages/ui/src/assets`, and `packages/app/public`.

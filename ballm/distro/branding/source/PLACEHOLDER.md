# Placeholder brand assets

These are deliberately temporary. They exist so the desktop, CLI, installer, and release pipeline
can be built and reviewed before design delivers final artwork.

Replace these files, then run:

```sh
cd ballm/distro
bun run icons
```

Files design should provide:

- `source/mark.svg` — square app mark, single color plus optional background
- `source/wordmark.svg` — horizontal wordmark, `currentColor`
- `source/app-icon.svg` — 1024×1024 app icon with background

The generated outputs land in `packages/desktop/icons/{dev,prod}` and `packages/app/public`.

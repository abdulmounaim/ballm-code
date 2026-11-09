# Release

## Versioning

`<upstream-version>-ballm.<n>`, for example `2.2.5-ballm.1`. The upstream version is the base in
`upstream.lock`; the suffix increments for Ballm-only changes.

## Artifacts

| Artifact           | Source                              | Destination                  |
| ------------------ | ----------------------------------- | ---------------------------- |
| CLI binaries       | `./distro/scripts/build-cli.sh`     | internal artifact store      |
| npm packages       | `bun run script/pack.ts`            | internal registry (optional) |
| Desktop installers | `./distro/scripts/build-desktop.sh` | internal artifact store      |
| Managed policy     | `ballm/managed/`                    | packaged with the installer  |
| Update feeds       | `ballm/distro/scripts/release.sh`   | Ballm update service         |

## Build

```sh
make -C ballm build-cli
make -C ballm build-desktop
make -C ballm release TAG=2.2.5-ballm.1
```

## Desktop branding

Edit `packages/desktop/electron-builder.config.ts`:

- `APP_IDS`, `appId`, `productName`, icons
- Linux executable, desktop entry, and metainfo
- `publish` URL, which must point at the Ballm update service

The build is incomplete until these are changed. Do not ship a build that still updates from
`opencode.ai`.

## Signing

- macOS: Developer ID Application certificate; notarize with `notarytool`.
- Windows: code-signing certificate; sign the installer and the executable.
- Linux: publish checksums and a detached signature.

Without signing, auto-update and managed installs will fail or warn on managed machines.

## Installer

`ballm/distro/installer/install.sh` and `install.ps1` are placeholders for:

1. verify the artifact signature;
2. install the CLI or desktop app;
3. write the managed policy to the platform path;
4. start the app and prompt for sign-in.

Managed policy installation requires root/administrator. On macOS prefer deploying the MDM profile
instead of writing a file.

## Release checklist

- [ ] `make -C ballm verify` passes
- [ ] `upstream.lock` matches the intended base
- [ ] managed policy statements reviewed
- [ ] desktop `publish` URL points at Ballm
- [ ] signing identities present
- [ ] update feed serves the new version
- [ ] rollback artifact from the previous release retained
- [ ] audit and revocation tested

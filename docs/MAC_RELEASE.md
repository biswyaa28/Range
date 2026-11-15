# macOS releases

## What is configured

- `productName`: Personal OS; identifier `com.biswyaa.personalos`; category
  Productivity; copyright Biswajeet Rout; minimum macOS 10.15.
- Bundle targets: `.app` and `.dmg`.
- Updater: `tauri-plugin-updater` with a minisign public key in
  `src-tauri/tauri.conf.json`. Private key lives outside git
  (`.tauri/personal-os.key`, git-ignored). Endpoint:
  `https://github.com/biswyaa28/personal-os/releases/latest/download/latest.json`
  — a documented constant; change it in the config if the repository moves.
- Settings → Updates → **Check for updates** appears on macOS only, shows
  download progress, and reports failure without blocking the app.

## Build

Requires the full Xcode toolchain (not only Command Line Tools) plus Rust.

```bash
npm ci
npm run tauri:build          # .app + .dmg in src-tauri/target/release/bundle
```

Signing updates needs the private key:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat .tauri/personal-os.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='personal-os-local'
```

`bundle.createUpdaterArtifacts` writes `*.app.tar.gz` and `.sig` files; upload
those with the DMG and a `latest.json` to the GitHub Release tagged `v*`.

### This machine

This machine has Command Line Tools only. A full `tauri build` fails while
linking macOS frameworks; `tauri build --debug` is attempted as a smoke check.
Install Xcode (App Store) and run `sudo xcode-select -s /Applications/Xcode.app`
before building.

## First run without a paid Apple account

The app is ad-hoc signed and not notarized, so Gatekeeper warns once:

1. Right-click the app → **Open** → **Open** (or System Settings → Privacy &
   Security → **Open anyway**).
2. If macOS says the app is damaged (quarantine flag):
   `xattr -dr com.apple.quarantine "/Applications/Personal OS.app"`.

Distributing that DMG publicly is allowed, but users see the warning.

## Developer ID signing + notarization — needs a paid Apple account

Only with an Apple Developer Program membership ($99/year). Set:

```bash
export APPLE_ID='you@example.com'
export APPLE_TEAM_ID='ABCDE12345'
export APPLE_PASSWORD='app-specific-password'   # appleid.apple.com, not your login
export APPLE_SIGNING_IDENTITY='Developer ID Application: Your Name (ABCDE12345)'
```

Then build with Tauri's built-in notarization (it picks up the variables above).
When the variables are absent the build proceeds unsigned — never block on them.

Manual alternative:

```bash
codesign --deep --force --options runtime --sign "$APPLE_SIGNING_IDENTITY" "Personal OS.app"
xcrun notarytool submit "Personal OS.dmg" --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD" --wait
xcrun stapler staple "Personal OS.dmg"
```

## Updater keys

Regenerate only if the current private key is lost (existing installs then
cannot verify updates):

```bash
npx tauri signer generate -w .tauri/personal-os.key
# replace plugins.updater.pubkey in src-tauri/tauri.conf.json with the .pub contents
```

Back up the private key and its password. Never commit them.

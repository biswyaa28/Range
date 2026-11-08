# Native macOS shell

The desktop shell uses Tauri v2 around the same Vite/React application. Web
storage and routes are unchanged; native exports use a macOS save dialog and
the native haptic command.

## Development

Install Node 20+, Rust, and the macOS Xcode command-line tools, then run:

```sh
npm install
npm run tauri:dev
```

The native window uses the Vite dev server at `http://localhost:5173`.

## Building

Build the signed-local artifacts with:

```sh
npm run tauri:build
```

This produces `src-tauri/target/release/bundle/macos/Personal OS.app` and a
DMG in `src-tauri/target/release/bundle/dmg/`.

## First launch

Local builds are unsigned. On first launch, control-click (or right-click)
`Personal OS.app`, choose **Open**, and confirm **Open** in the macOS warning.

For distribution, an Apple Developer account is needed to configure a
Developer ID application certificate, sign the app and DMG, enable hardened
runtime, and notarize the release with Apple.

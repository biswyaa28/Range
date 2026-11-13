# Native shells

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

## Backup file access

Tauri v2 does not let the dialog widen the filesystem scope by itself. The
capability in `src-tauri/capabilities/default.json` therefore grants
`fs:allow-write-file` only for the paths the save dialog returns and for
`$DOWNLOAD`, `$DOCUMENT` and `$DESKTOP`. There is no `$HOME` wildcard.

Verify after a signed local build:

1. Settings → Data → **Export JSON** and save into Downloads.
2. Confirm the file exists, opens as valid JSON, and no "forbidden path"
   error appears in the devtools console.
3. Save a second export to Desktop and to Documents.
4. Settings → Data → **Import JSON** and pick that file; the record counts
   match before confirming.
5. Repeat once with a path outside those three folders (for example `/tmp`)
   and confirm the save fails with a clear error rather than silently.

## First launch

Local builds are unsigned. On first launch, control-click (or right-click)
`Personal OS.app`, choose **Open**, and confirm **Open** in the macOS warning.

For distribution, an Apple Developer account is needed to configure a
Developer ID application certificate, sign the app and DMG, enable hardened
runtime, and notarize the release with Apple.

## Android

The Android shell uses Capacitor (not Tauri). Native exports use Android
storage and the native haptic command.

### Build instructions

Install Node 20+, JDK 21+, and Android Studio, then run:

```sh
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The debug APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.
Use `npx cap open android` to open the project in Android Studio.

### Health Connect manifest guard

The health plugin ships every Health Connect read and write permission it
supports. `android/app/src/main/AndroidManifest.xml` allowlists the three read
scopes and removes the rest during manifest merging.

After every plugin update or `npx cap sync android`, build the debug APK and
run the guard:

```sh
npx cap sync android
cd android && ./gradlew assembleDebug && cd ..
npm run check:health-manifest
```

The guard reads the newest debug merged manifest under
`android/app/build/intermediates/merged_manifest*/` (falling back to another
variant if no debug build exists) and fails unless the health permission set
is exactly `READ_STEPS`, `READ_SLEEP`, and `READ_ACTIVE_CALORIES_BURNED`; any
`WRITE_*` or extra read scope is an error.
It is not part of `npm run check` because CI does not run Gradle.

### Sideload via adb

```sh
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Google sign-in needs `android/app/google-services.json` and a registered
signing SHA-1; see [`AUTH.md`](AUTH.md).

### The GitHub-504 Gradle workaround

To resolve the GitHub-504 error during Gradle sync, add the following to
`android/app/gradle.properties`:

```
org.gradle.jvmargs=-Xmx4096m
```

Also, increase memory allocation in Android Studio's Gradle Settings.

### Play Store requirements

Play Store needs a signing key and a $25 developer account but is not needed for personal use. For sideloading, you can use the debug keystore generated during development.


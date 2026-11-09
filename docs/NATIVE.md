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

## Android

The Android shell uses a Gradle-based build system. The native exports use Android storage and the native haptic command.

### Build instructions

Install Node 20+, JDK 11+, and Android Studio, then run:

```sh
npm install
npm run tauri:android:dev
```

### Sideload via adb

Build the signed APK with:

```sh
npm run tauri:android:build
```

This produces `src-tauri/target/release/bundle/android/app-release.apk`. Transfer the APK to your device and install via ADB:

```sh
adb install src-tauri/target/release/bundle/android/app-release.apk
```

### The GitHub-504 Gradle workaround

To resolve the GitHub-504 error during Gradle sync, add the following to `android/app/gradle.properties`:

```
org.gradle.jvmargs=-Xmx4096m
```

Also, increase memory allocation in Android Studio's Gradle Settings.

### Play Store requirements

Play Store needs a signing key and a $25 developer account but is not needed for personal use. For sideloading, you can use the debug keystore generated during development.


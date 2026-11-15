# Android release builds

## What ships

- `npm run android:release` builds `android/app/build/outputs/bundle/release/app-release.aab`
  and `android/app/build/outputs/apk/release/app-release.apk`.
- R8 minification and resource shrinking are on. Keeps for Capacitor, the
  Health Connect plugin, local notifications and Firebase/Google sign-in live
  in `android/app/proguard-rules.pro`. Re-run a release build and the manifest
  guard after any plugin update.
- Without signing material the build still succeeds but produces an **unsigned**
  APK/AAB and prints a warning. That is the CI path.

## One-time keystore

```bash
KEYSTORE_PASSWORD='…' KEY_PASSWORD='…' ./scripts/make-keystore.sh
```

This writes `android/personal-os-release.jks` and `android/keystore.properties`
(both git-ignored) and prints the SHA-1/SHA-256 fingerprints. Copy them into
Firebase → Project settings → Your apps → Android so Google sign-in works in
release builds.

Back up the keystore **and** `keystore.properties` somewhere safe (password
manager + offline copy). If you lose them and have not enrolled in Play App
Signing, you cannot update the app under the same listing.

## Signing sources

`android/app/build.gradle` reads, in order:

1. `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD` environment variables.
2. `android/keystore.properties` with `storeFile`, `storePassword`, `keyAlias`,
   `keyPassword`.

Never commit either source. The `storeFile` path may be absolute or relative to
`android/`.

## Play Console

- **Play App Signing:** opt in. Upload the AAB from `android:release`; Google
  re-signs with the app signing key. Keep the upload keystore for future
  uploads, and add the *Play app signing* SHA-1/SHA-256 to Firebase too.
- **Privacy policy:** the Health Connect URL is generated from
  `PRIVACY_POLICY_URL` (default `https://biswyaa28.github.io/personal-os/privacy.html`).
  Use the same URL in the Data safety form.
- **Data safety:** match `docs/privacy-policy.md` exactly. Declare:
  - Data collected: app activity (tasks/notes you sync), personal info (name,
    email from Google sign-in only), health data (steps, sleep, active calories
    read from Health Connect).
  - Purpose: app functionality and sync only. Not shared with third parties for
    advertising. Encrypted in transit. Deletable in-app ("Delete my cloud data").
  - Crash reports: only if the user opts in — error type/message/stack, app
    version, platform. No notes, titles, emails or keys.
  - AI assistant: user-provided text sent to Google Gemini only when enabled.
- **Content rating:** complete the questionnaire honestly. Expect Everyone /
  PEGI 3; no ads, no user-generated public content, no purchases.
- **Health apps declaration:** Health Connect data is read-only and used for
  in-app insights. Complete the Health apps form if prompted.

## Smoke test

`cd android && ./gradlew assembleDebug` and install on a device, then
`npm run check:health-manifest`. For release, after `android:release`, run
`npm run check:health-manifest` again — it validates the newest merged manifest
(including `release/`). Installing a release build requires a signed APK;
without a keystore use the debug build.

## Edge-to-edge manual checklist

The WebView is padded by native system-bar and IME insets (`MainActivity`), and
the same values are exposed as `--safe-top`, `--safe-bottom`, `--safe-left`,
`--safe-right`. Check on a physical device or emulator:

- Android 8 (API 26), 3-button navigation: status bar and nav bar clear the top
  nav and bottom tab bar; no double spacing.
- Android 13 (API 33), gesture navigation: tab bar sits above the gesture pill;
  task/chat composer stays above the keyboard when it opens.
- Android 15/16 (API 35/36), gesture + 3-button: modals are inset and their
  close/action buttons are tappable; the keyboard never covers the chat input
  or the prompter controls.
- Toggle light/dark in Settings: status/nav icons flip contrast and the inset
  strips match the page background.

# Google sign-in setup

Personal OS signs in with Google and then uses the Firebase **JS** SDK everywhere,
so Firestore sync sees one auth model on every platform.

| Build | Flow |
| --- | --- |
| Web | Firebase popup (`signInWithPopup`) — unchanged |
| macOS (Tauri) | System browser OAuth 2.0 with PKCE + `127.0.0.1` loopback, run in Rust |
| Android (Capacitor) | `@capacitor-firebase/authentication` account picker, ID token exchanged with `signInWithCredential` |

No tokens are written to disk by our code. The Firebase SDK owns its refresh
token; the AI key stays in Keychain/Keystore.

## macOS

1. Google Cloud console → project `range6969` → **APIs & Services → Credentials**
   → **Create credentials → OAuth client ID → Desktop app**. Download the JSON;
   do not commit it.
2. Put the values in `.env.local` (git-ignored):
   ```
   GOOGLE_DESKTOP_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_DESKTOP_CLIENT_SECRET=...
   ```
   `src-tauri/build.rs` passes them to `rustc` only. They are never in the JS
   bundle and never in git.
3. Firebase console → **Authentication → Sign-in method → Google**: enable it.
4. If sign-in returns *“Google rejected this build”*, add the desktop client ID
   under **Authentication → Settings → Authorized domains / Safelist client IDs
   from external projects**. Desktop ID tokens carry that audience.
5. No redirect URI needs registering: Google accepts any
   `http://127.0.0.1:<port>` loopback redirect for Desktop clients.
6. `npm run tauri:dev` or `npm run tauri:build`. Signing out only clears the
   Firebase session; the system browser keeps its own Google session.

Cancel: the Settings button shows **Waiting for browser…** with **Cancel** while
the loopback listener is open. The flow also times out after 120 seconds.

## Android

1. Firebase console → project settings → **Your apps → Android**, package
   `com.biswyaa.personalos`. Add the signing fingerprints before downloading
   `google-services.json`.
2. Read the debug fingerprint (Android Studio creates this keystore on the
   first build):
   ```sh
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
     -storepass android -keypass android
   ```
3. Read the release/upload fingerprint (skip until you have a release key):
   ```sh
   keytool -list -v -keystore /path/to/release.keystore -alias <alias>
   ```
4. Copy the SHA-1 (and SHA-256 when Play App Signing is enabled) into Firebase
   console → **Project settings → Your apps → Android → Add fingerprint**.
5. Download `google-services.json` and put it in `android/app/` (git-ignored).
   Re-download it after adding a fingerprint: existing files do not pick up new
   fingerprints. Without the file the app builds but Google sign-in fails at
   runtime.
6. Enable **Google** in Authentication → Sign-in method.
7. `npx cap sync android && cd android && ./gradlew assembleDebug`.
8. Sign-out calls the native plugin `signOut()` and then the Firebase SDK, so
   the account picker starts clean next time. The app restores the Firebase
   session on relaunch through `onAuthStateChanged`.

Errors are mapped to short copy (`src/platform/googleAuth.ts`); a dismissed
picker is silent. No token or stack trace is ever shown or logged.

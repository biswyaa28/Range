# Google integrations setup

Personal OS reads Gmail and Google Classroom directly through the Google REST
APIs. `gog` was checked locally (v0.47.1), but it is a separate desktop CLI and
cannot run inside the Android app, so the app does not depend on it. The app
uses these read-only scopes, requested only when you enable the matching
integration:

| Integration | Scope |
| --- | --- |
| Gmail | `gmail.readonly` |
| Classroom courses | `classroom.courses.readonly` |
| Classroom coursework | `classroom.coursework.me.readonly` |
| Classroom announcements | `classroom.announcements.readonly` |
| Classroom submissions | `classroom.student-submissions.me.readonly` |

There is no send, mark-read, archive or delete path. Classroom submission is
not available through the API; the Inbox and Classroom panels link out to the
assignment instead.

## 1. Create the Google Cloud project

1. Open <https://console.cloud.google.com/> and create a project (or select
   the existing Firebase project used by Personal OS).
2. **APIs & Services → Library**: enable **Gmail API** and **Google Classroom
   API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - Publishing status: **Testing**.
   - App name, support email and developer email: fill all required fields.
   - **Test users**: add every Google account you will sign in with.
4. Keep the app in Testing while developing. Google expires Testing-mode
   refresh tokens after **7 days**. Personal OS detects `invalid_grant`, clears
   the token, keeps cached data readable and shows **Reconnect Google**; it does
   not loop or crash.

## 2. Desktop OAuth client (macOS build)

1. **Credentials → Create credentials → OAuth client ID → Desktop app**.
2. Copy the client ID and client secret. They are build-time inputs, never
   committed. Export them before `npm run tauri:build` (or `npm run tauri:dev`):

   ```bash
   export GOOGLE_DESKTOP_CLIENT_ID="....apps.googleusercontent.com"
   export GOOGLE_DESKTOP_CLIENT_SECRET="..."
   ```

   The existing Firebase sign-in and the integration flow share this desktop
   client. The secret is compiled into the Rust binary, not written to the
   repository, `dist`, or Firestore.
3. The redirect URI is a random `http://127.0.0.1:<port>` loopback address, so
   no fixed redirect URI has to be registered for a Desktop client.

## 3. Android OAuth client

The Android build already has Firebase Google sign-in. Add the integration
scopes to that same OAuth client rather than creating a separate web session.

1. Get the debug signing fingerprint:

   ```bash
   keytool -list -v \
     -keystore ~/.android/debug.keystore \
     -alias androiddebugkey \
     -storepass android -keypass android
   ```

2. **Credentials → Create credentials → OAuth client ID → Android**:
   - Package name: `com.biswyaa.personalos`
   - SHA-1 fingerprint: the debug SHA-1 above. Add the release/Play App Signing
     SHA-1 as a second Android client before shipping.
3. Download the updated `google-services.json` into `android/app/`. It is
   git-ignored; do not commit it.
4. Rebuild the APK. The native Google account picker requests the Classroom or
   Gmail scopes only when you flip that integration on in Settings.

Android's Google sign-in returns a one-hour access token and no refresh token.
When it expires, the Inbox shows **Reconnect Google**; this is expected with the
current Capacitor auth plugin.

## 4. Verify

1. Launch the Mac or Android build.
2. **Settings → Integrations**: enable Gmail or Classroom and complete consent.
3. Open **Inbox** from the Home card or the mobile **More** sheet. Cached data
   shows a last-updated time; pull down or press **Refresh** to fetch again.
4. Reload. The cache and secure token survive; no Google data is in
   `personalOS_v1`, Firestore or a backup unless **Include integration data in
   backups** is on.
5. Turn on **Let AI read integration data**. The AI preview shows exactly the
   sender, subject and snippet records that would be sent. Full bodies are not
   included and the toggle is off by default.
6. **Disconnect and delete data** calls Google's revoke endpoint and deletes the
   local cache. Revoking Google access ends all scopes on that token, so the
   other integration asks to reconnect.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Google integrations are not configured in this build` | Rebuild the desktop app with both `GOOGLE_DESKTOP_CLIENT_ID` and `GOOGLE_DESKTOP_CLIENT_SECRET` exported. |
| `access_denied` / app not verified | Add the account under **OAuth consent screen → Test users** while the app is in Testing. |
| `Google denied access` (403) | Enable the Gmail/Classroom API in the same Cloud project, and confirm the account is a test user. |
| `invalid_grant` after a week | Testing-mode refresh token expired. Press **Reconnect Google**. |
| Browser build says not available | Expected: Google integrations require the Android or Mac build. |

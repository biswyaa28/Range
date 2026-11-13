# Firebase sync (Spark plan)

Personal OS is local-first. Sync is optional: when the Firebase environment
variables are absent, the app never loads the SDK and every surface stays
local-only.

This guide uses only the Firebase **Spark** (free) plan: Google sign-in, one
Firestore database and owner-only security rules. No Cloud Functions, Storage
or billing account are required.

## 1. Create the project

1. Open the [Firebase console](https://console.firebase.google.com/) and choose
   **Add project**.
2. Name it (for example `personal-os`) and keep **Google Analytics** off unless
   you need it. Spark remains the active plan.
3. In **Project settings → Your apps**, add a **Web** app (`</>`), give it a
   nickname such as `personal-os-web`, and register it. Do not enable Hosting
   for this step.
4. Copy the `firebaseConfig` values from the app registration.

The web config values identify the project; they are not secrets. Access is
enforced by Firestore rules, so never put an admin/service-account key in a
`VITE_*` variable.

## 2. Enable Google sign-in

1. Go to **Build → Authentication → Get started**.
2. Open the **Sign-in method** tab, select **Google**, enable it, choose a
   project support email and save.
3. Under **Authorized domains**, keep `localhost` and add the domain you deploy
   to (for example `personal-os.example.com`).

## 3. Create Firestore

1. Go to **Build → Firestore Database → Create database**.
2. Choose **Production mode** and a location close to you.
3. Open the **Rules** tab and paste the contents of
   [`firestore.rules`](../firestore.rules). That file is the source of truth:
   it allows only the four record collections and the three `state` documents,
   and validates their shape. Do not replace it with a wildcard rule such as
   `match /{document=**}`; the checked-in rules are the only supported policy.
4. Publish the rules.

To deploy from the CLI instead, install `firebase-tools`, run
`firebase init firestore` in this repo (accept the existing `firestore.rules`),
then `firebase deploy --only firestore:rules`.

## 4. Configure the app

1. Copy `.env.example` to `.env.local`.
2. Fill in the values from the web app registration:

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=personal-os.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=personal-os
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
VITE_FIREBASE_STORAGE_BUCKET=personal-os.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
```

Only the first four are required; Storage and Messaging are accepted for
compatibility but sync does not use them.

3. Restart `npm run dev`. Vite reads env vars at startup.
4. Open **Settings → Sync**, sign in with Google and press **Sync now**.

`.env.local` is git-ignored. Builds for other environments need the same
variables at build time.

## 5. Data layout

Everything is stored under the signed-in user's UID:

```
users/{uid}/tasks/{taskId}
users/{uid}/notes/{noteId}
users/{uid}/blocks/{blockId}
users/{uid}/deadlines/{deadlineId}
users/{uid}/state/app           # profile, layout, legacy settings
users/{uid}/state/stats         # day stats, capped at 400 KB
users/{uid}/state/preferences   # versioned settings; never contains the AI key
```

Records are plain JSON with their existing `id`, `createdAt`, `updatedAt`,
`deleted` and `deviceId` fields. ISO strings are used throughout; no Firestore
`Timestamp` conversion is involved. An account written by an older build may
still carry a legacy `dayStats` key in `state/app`; the rules accept it, but new
writes put the day map in `state/stats`.

## 6. How syncing behaves

- **Sign in** pulls the remote snapshot, merges it, then pushes local changes.
  The same pull → merge → push loop runs after **Sync now** and after local
  edits (debounced by 15 seconds; a manual sync runs immediately).
- **Last-write-wins** compares `updatedAt` per record. A local edit is ignored
  when the remote copy is newer, and vice versa.
- **Deletes are tombstones.** Deleting a record sets `deleted: true` and a new
  `updatedAt`; that tombstone wins only while it is the newest version. An
  older edit cannot resurrect it.
- **Sync cursor.** `AppState.syncedAt` advances to the time the sync started,
  so edits made while a sync is in flight stay pending for the next pass.
- **Offline first.** When the browser reports offline, the engine skips network
  work, keeps changes pending and shows an offline badge. Reconnecting retries
  automatically. Firestore runs with persistent IndexedDB cache and multi-tab
  support when the browser allows it; otherwise it falls back to an in-memory
  cache.
- **Per-device identity.** Every record keeps the `deviceId` that created it.
  The engine never rewrites another device's `deviceId`.
- **Sign out does not delete local data.** It stops uploads. Signing into a
  different account does **not** upload the local dataset to that account;
  only edits made after the switch sync. The new account's existing remote
  data is pulled as usual.
- **Clearing local data does not clear the cloud.** The next sync pulls remote
  documents back. Sign out before clearing, or delete the user's documents in
  the Firebase console, to erase cloud data.
- **The AI API key never syncs.** It lives in the platform secure store, not in
  `Settings`, so no preferences document can carry it. A stray key in a remote
  document is discarded during normalization; the local secure copy survives
  remote preference merges.

## 7. Spark plan limits

At the time of writing, Spark includes:

- 1 GiB Firestore storage
- 50,000 document reads per day
- 20,000 document writes per day
- 20,000 document deletes per day
- Google sign-in through Firebase Authentication

A sync pulls four small collections plus three state documents, so normal
personal use is comfortably inside the quota. Heavy multi-device use or large
note histories can approach it. Upgrade to Blaze only if the project actually
outgrows Spark; this integration does not require it.

## 8. Tests

The suite uses a mocked `SyncAdapter`, so it never contacts Firebase:

```bash
npx vitest run tests/unit/syncEngine.test.ts
npm run check
```

Covered cases include remote merge, local-only push, LWW preferences, tombstones,
offline status and reconnect, error retries, sign-out and the guarantee that the
AI key never reaches a push payload.

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Settings shows **Not configured** | A required `VITE_FIREBASE_*` value is missing; restart the dev server after editing `.env.local`. |
| `auth/unauthorized-domain` | Add the current origin under Authentication → Settings → Authorized domains. |
| `Missing or insufficient permissions` | Publish `firestore.rules` and make sure the signed-in UID matches the document path. |
| Sign-in popup is blocked | Allow popups for the app origin. Native builds use the Android account picker or the macOS system-browser flow instead of a webview popup. |
| Offline changes never appear on another device | Confirm the browser reports online, then press **Sync now**; check the Sync status message for an error. |

## 10. Native shells

Native Google sign-in is supported. The sync adapter always exchanges a Google
credential with the Firebase JS SDK, but the credential comes from the platform
flow:

- **Web** — Firebase `signInWithPopup`.
- **Android (Capacitor)** — `@capacitor-firebase/authentication` account picker,
  then `signInWithCredential`. Requires `android/app/google-services.json` and
  the signing SHA-1 registered in Firebase (see [`AUTH.md`](AUTH.md)).
- **macOS (Tauri)** — Google desktop OAuth with PKCE and a `127.0.0.1` loopback
  listener in Rust, then `signInWithCredential`. Requires the desktop OAuth
  client values in `.env.local` (see [`AUTH.md`](AUTH.md)).

The credential plumbing lives in `src/platform/googleAuth.ts`; no separate auth
bridge is involved.

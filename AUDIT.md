# Personal OS — security, sync, bug and UX audit

Audit scope: `src/`, `src-tauri/`, `android/`, `firestore.rules`, configs.
Baseline: `npm run check` green (64 e2e passing) before any change.

Severity: Critical = exploitable or data loss; High = broken security/feature in a shipped build;
Med = real defect with a workaround; Low = hardening / polish.

## Findings

| ID | Area | Severity | File:line | Problem | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | Tauri | High | `src-tauri/tauri.conf.json:28` | CSP `connect-src 'self'` blocks Firebase Auth/Firestore and Gemini. Sync and AI silently fail in the macOS build. | Allowlist only the Google/Firebase hosts actually used, plus `frame-src` for the auth popup. | Fixed |
| SEC-02 | Android | High | `android/app/src/main/AndroidManifest.xml:5` | `allowBackup="true"` uploads notes/tasks and the Capacitor secure-storage token to Google cloud backup / `adb backup`. | `allowBackup="false"` + explicit `usesCleartextTraffic="false"`. | Fixed |
| SEC-03 | Firestore | High | `firestore.rules:6` | Wildcard `{document=**}` with auth-only check: no collection allowlist, no field or size validation, any depth writable. | Explicit collection matches, per-doc key/type/size guards, deny root and unknown depth. | Fixed |
| SEC-04 | AI | High | `src/engines/llm/readTools.ts:27` | Note text can contain `</untrusted-local-data>` and escape the data fence, turning a synced note into instructions. | Strip fence tokens from all untrusted text before fenced output. | Fixed |
| SEC-05 | Auth | High | `src/sync/firebaseAdapter.ts:93` | Desktop shells use `signInWithPopup`; WKWebView cannot complete a Firebase popup, so Google sign-in fails on macOS. | Requires a desktop OAuth client (PKCE + loopback) — needs console setup. | Needs me |
| SEC-06 | Auth | High | `android/app/build.gradle:56` | No `google-services.json`; Android Google sign-in cannot run until the Firebase app config is added. | Add the file from Firebase console (git-ignored by design). | Needs me |
| SEC-07 | Secrets | Low | `.gitignore:24` | `*firebase*.json` also ignores `firebase.json` and `firestore.indexes.json`, so new config is silently untracked. | Narrow the glob to admin-SDK credentials only. | Fixed |
| SEC-08 | Deps | Low | `package.json` | `npm audit`: 6 high, all transitive `@grpc/grpc-js` under `firebase`/`firestore-compat`; no fix without a breaking downgrade. | Not fixable without downgrade. | Won't fix |
| SEC-09 | Tauri | Med | `src-tauri/capabilities/default.json:11` | `fs:allow-write-file` declared without a path scope; backup export may be rejected at runtime. | Verify on a signed macOS build; add the narrowest scope needed. | Needs me |
| SEC-10 | Android | Low | `android/app/src/main/res/xml/file_paths.xml:3` | FileProvider exposes `external-path "."` (whole external root) for share. | Capacitor default; as narrow as the share flow allows. | Won't fix |
| SEC-11 | Local data | Med | `src/features/chat/ChatPanel.tsx:296` | AI transcript (may contain private-note snippets) stays in `localStorage` after sign-out on a shared device. | Clear the local-only transcript when the account is signed out. | Fixed |
| SYNC-01 | Sync | Med | `src/store/merge.ts:72` | Equal `updatedAt` means the remote copy is always dropped — no `deviceId` tiebreak, so a same-millisecond edit is lost. | Deterministic tiebreak on `deviceId`; both devices converge. | Fixed |
| SYNC-02 | Sync | High | `src/sync/engine.ts:419` | Signing into a different account re-uploads the previous account's whole dataset to the new account. | Do not auto-upload history on account switch; only new edits sync. | Fixed |
| SYNC-03 | Sync | Med | `src/sync/engine.ts:19` | Every edit triggers a full pull of 4 collections after 2s; a burst of edits burns Spark read quota. | Debounce raised to 15s (manual/"sync now" unaffected). | Fixed |
| SYNC-04 | Sync | Low | `src/sync/firebaseAdapter.ts:161` | Tombstones are pushed as records and never garbage-collected. | Acceptable: deletion needs tombstones to sync. | Won't fix |
| BUG-01 | AI | High | `src/engines/llm/readTools.ts:97` | `get_stats` slices object insertion order, not dates, so it reports an arbitrary 7 days. | Sort day stats by date before slicing. | Fixed |
| BUG-02 | AI | Med | `src/actions/registry.ts:950` | "Only the first 8 proposed actions…" is pushed once per call, up to 8 duplicates. | Emit once for the batch. | Fixed |
| BUG-03 | Shell | High | `src/App.tsx:221` | No error boundary: a failed lazy chunk or render throw leaves a blank window with no recovery. | Add a route-level plus app-level boundary with reload. | Fixed |
| BUG-04 | AI | — | `src/features/chat/ChatPanel.tsx:315` | Read-tool results were not sent back to Gemini as function responses. | Already implemented and covered by `tests/e2e/chat.spec.ts`. | Verified |
| UX-01 | A11y | Low | `src/main.tsx:26` | No global `unhandledrejection` reporting; failures only surface per-call. | Out of scope for this pass. | Won't fix |
| UX-02 | Test | Low | `firestore.rules` | Rules are not covered by an emulator suite; no `firebase-tools` in the project. | Add rules unit tests when the emulator is available. | Needs me |

## Verification

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, vitest, build, motion CSS, 64 e2e) | pass |
| Android debug APK (`npx cap sync android && ./gradlew assembleDebug`) | pass — 8.0M `app-debug.apk`; manifest verified `allowBackup=false`, `usesCleartextTraffic=false` |
| macOS Rust (`cargo check` in `src-tauri`) | pass |
| macOS `tauri build` | blocked: no full Xcode on this machine (`xcode-select` → CommandLineTools) |
| Firestore rules emulator load (firebase-tools 13.35.1, Java 17) | pass — rules compile and the emulator starts |
| Firestore rules assertions | not automated: no `@firebase/rules-unit-testing` suite in the repo |

## Decisions

- Account switch: local records stay on disk but are no longer uploaded to a newly
  signed-in account. Only edits made after the switch sync. A user who wants to
  seed a second account has to re-enter the data; that is the safer default on a
  shared device. Existing sync tests were updated to lock this in.
- Sign-out clears the local AI transcript (`personalOS_chat_v1`) because it can
  quote note bodies. Planner data is untouched.
- Auto-sync debounce moved from 2s to 15s; "sync now" is unchanged.
- The Firestore rules refuse hard deletes; the app only soft-deletes, so this
  does not change behaviour.

## Manual checklist

1. Two-device sync: sign in on Mac and Android, add a task on each while offline, reconnect both, confirm both tasks appear everywhere with no duplicate ids.
2. Same item edited on both while offline: newer `updatedAt` wins; on a tie the higher device id wins and both devices settle on it.
3. Delete a note on one device while the other edits it: the newer change wins; an older edit must not resurrect a deleted note.
4. Sign out on Android and sign in as a second Google account: the first account's notes must not appear in Firestore under the new uid.
5. Android hardware back: closes the chat sheet, palette, focus mode, then a route, then minimizes the app.
6. Haptics: toggle switches, task completion and timer end buzz on a physical device (emulators have no motor).
7. macOS: traffic lights do not overlap the nav bar; drag any empty top-bar area moves the window.
8. Firestore emulator: `firebase emulators:exec --only firestore "npm run test"` once rules tests exist.

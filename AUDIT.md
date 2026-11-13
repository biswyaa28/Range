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
| SEC-05 | Auth | High | `src/sync/firebaseAdapter.ts:93` | Desktop shells use `signInWithPopup`; WKWebView cannot complete a Firebase popup, so Google sign-in fails on macOS. | Desktop sign-in now runs a Rust PKCE + loopback flow (`google_sign_in`) and exchanges the credential with the Firebase JS SDK; the popup path only runs on the web. | Fixed |
| SEC-06 | Auth | High | `android/app/build.gradle:56` | No `google-services.json`; Android Google sign-in cannot run until the Firebase app config is added. | `android/app/google-services.json` is present (git-ignored) with the debug SHA-1 registered. | Fixed |
| SEC-07 | Secrets | Low | `.gitignore:24` | `*firebase*.json` also ignores `firebase.json` and `firestore.indexes.json`, so new config is silently untracked. | Narrow the glob to admin-SDK credentials only. | Fixed |
| SEC-08 | Deps | Low | `package.json` | `npm audit`: 6 high, all transitive `@grpc/grpc-js` under `firebase`/`firestore-compat`; no fix without a breaking downgrade. | Not fixable without downgrade. | Won't fix |
| SEC-09 | Tauri | Med | `src-tauri/capabilities/default.json:11` | `fs:allow-write-file` declared without a path scope; backup export may be rejected at runtime. | Verify on a signed macOS build; add the narrowest scope needed. | Needs me |
| SEC-10 | Android | Low | `android/app/src/main/res/xml/file_paths.xml:3` | FileProvider exposes `external-path "."` (whole external root) for share. | Capacitor default; as narrow as the share flow allows. | Won't fix |
| SEC-11 | Local data | Med | `src/features/chat/ChatPanel.tsx:296` | AI transcript (may contain private-note snippets) stays in `localStorage` after sign-out on a shared device. | Clear the local-only transcript when the account is signed out. | Fixed |
| SYNC-01 | Sync | Med | `src/store/merge.ts:72` | Equal `updatedAt` means the remote copy is always dropped — no `deviceId` tiebreak, so a same-millisecond edit is lost. | Deterministic tiebreak on `deviceId`; both devices converge. | Fixed |
| SYNC-02 | Sync | High | `src/sync/engine.ts:419` | Signing into a different account re-uploads the previous account's whole dataset to the new account. | Do not auto-upload history on account switch; only new edits sync. | Fixed |
| SYNC-03 | Sync | Med | `src/sync/engine.ts:19` | Every edit triggers a full pull of 4 collections after 2s; a burst of edits burns Spark read quota. | Debounce raised to 15s (manual/"sync now" unaffected). | Fixed |
| SYNC-04 | Sync | Low | `src/sync/firebaseAdapter.ts:161` | Tombstones are pushed as records and never garbage-collected. | Superseded by S5 (TTL `expireAt` plus local GC). | Fixed |
| BUG-01 | AI | High | `src/engines/llm/readTools.ts:97` | `get_stats` slices object insertion order, not dates, so it reports an arbitrary 7 days. | Sort day stats by date before slicing. | Fixed |
| BUG-02 | AI | Med | `src/actions/registry.ts:950` | "Only the first 8 proposed actions…" is pushed once per call, up to 8 duplicates. | Emit once for the batch. | Fixed |
| BUG-03 | Shell | High | `src/App.tsx:221` | No error boundary: a failed lazy chunk or render throw leaves a blank window with no recovery. | Add a route-level plus app-level boundary with reload. | Fixed |
| BUG-04 | AI | — | `src/features/chat/ChatPanel.tsx:315` | Read-tool results were not sent back to Gemini as function responses. | Already implemented and covered by `tests/e2e/chat.spec.ts`. | Verified |
| UX-01 | A11y | Low | `src/main.tsx:26` | No global `unhandledrejection` reporting; failures only surface per-call. | Out of scope for this pass. | Won't fix |
| UX-02 | Test | Low | `firestore.rules` | Rules are not covered by an emulator suite; no `firebase-tools` in the project. | Superseded by S6: `npm run test:rules` runs 27 emulator assertions and skips when the toolchain is missing. | Fixed |
| S1 | Sync | High | `src/sync/firebaseAdapter.ts:193` | `push` writes all collection records and `state` docs into a single `writeBatch`, failing past Firestore's 500-op limit and abandoning the whole sync on any batch error. | `planPushBatches` splits the payload into ≤400-op chunks committed sequentially; `SyncEngine.pushWithProgress` records each committed chunk in a push ledger, so a retry skips what already landed and `syncedAt` only advances after the last chunk. | Fixed |
| S2 | Sync | High | `src/sync/engine.ts:372` | `dayStats` grows forever in `state/app` and local storage, eventually exceeding Firestore's 500 KB rule limit and 1 MiB document cap. | `pruneDayStatsByAge` keeps 730 days locally, on merge and before each push; `buildStateAppPayload`/`capDayStats` cap the synced day map at 400 KB by dropping the oldest days and surface *Older stats were trimmed to keep sync working*. The map moved to its own `state/stats` document, written with a plain `set` so pruned days do not linger under a merge. | Fixed |
| S3 | Sync | Med | `src/sync/firebaseAdapter.ts:167` | Every sync reads all four collections from scratch, burning Spark 50k/day read quota on repeat syncs. | Incremental pull with `where('updatedAt', '>', since)` and a 10-minute overlap, driven by `planPull` and a `SyncStateStore` cursor. Full pulls on first sign-in, account change, invalid cursor, schema change, >60 days offline, and once every 24 hours. | Fixed |
| S4 | Sync | Med | `src/store/merge.ts:38` | Incoming records with a future `updatedAt` permanently pin LWW against normal clocks, and local stamping does not enforce monotonic progression per record. | `mergeRemote` clamps an incoming stamp more than 5 minutes ahead of the local clock to `now`, then applies the `deviceId` (or canonical-JSON for singletons/day stats) tiebreak; `nextStamp` keeps every local stamp strictly after the previous one. | Fixed |
| S5 | Sync | Med | `src/sync/firebaseAdapter.ts:206` | Soft-deleted tombstones accumulate forever in Firestore and local storage with no TTL or offline-cursor safety window. | The adapter stamps `expireAt` (a Firestore `Timestamp`, `updatedAt + 90d`) on tombstones only, the rules accept it, and `gcExpiredTombstones` removes pushed tombstones older than 90 days locally. A stale-cursor full pull reconciles records the remote dropped via the push ledger, so nothing resurrects and no local edit is lost. TTL commands in `docs/OPS.md`. | Fixed |
| S6 | Firestore | Med | `firestore.rules:16` | Security rules and client payload shapes are not locked together by automated emulator and unit tests. | Added `@firebase/rules-unit-testing` with `npm run test:rules` (27 emulator tests, skipped gracefully without Java ≥21/Firebase CLI) and `tests/unit/syncPayloadAllowlist.test.ts`, which keeps `STATE_APP_ALLOWED_KEYS` identical to the rules' `hasOnly` list inside `npm run check`. | Fixed |
| S7 | UX | Low | `src/features/settings/SettingsView.tsx:149` | Settings sync status shows an absolute timestamp instead of relative time (`Last synced <relative time>`). | `formatRelativeTime` renders *Last synced 5 minutes ago* (and *Not synced yet*), the error status shows its message in `.settings-sync-error`, and the last sync notice has its own row. | Fixed |
| SYNC-05 | Sync | Med | `src/store/merge.ts:142` | `dayStats` LWW merge copies raw remote fields onto existing entries without type-checking numbers, and equal-timestamp ties on singletons/dayStats lack a deterministic tiebreak. | `sanitizeDayStats` validates every numeric field on insert and update (and clamps the stamp); singletons and day stats break a tie on canonical JSON, so both devices converge. | Fixed |
| FIX-01 | Firestore | Critical | `firestore.rules:21` | `request.resource.size` does not exist in the rules language (`Resource` exposes only `__name__`, `data`, `id`), so every record write was denied with *Property size is undefined on object*. Present in `HEAD`, found by the new S6 emulator suite. | Replaced the byte checks with key-count limits; the byte cap stays client-side (`STATE_APP_MAX_BYTES`) and is documented next to the rule. | Fixed |
| FIX-02 | Sync | Med | `src/sync/engine.ts:118` | `sameState` did not compare `notice`, so a status update that only changed the notice was dropped and the S2 trim message never reached the UI. | Compare `notice` as part of the state identity; regression covered by `syncStatsCap.test.ts`. | Fixed |


## Verification

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, 67 vitest files / 492 tests, build, motion CSS, 64 e2e) | pass |
| Android debug APK (`npx cap sync android && ./gradlew assembleDebug`) | pass — 8.0M `app-debug.apk`; manifest verified `allowBackup=false`, `usesCleartextTraffic=false` |
| macOS Rust (`cargo check` in `src-tauri`) | pass |
| macOS `tauri build` | blocked: no full Xcode on this machine (`xcode-select` → CommandLineTools) |
| Firestore rules assertions (`npm run test:rules`, emulator, Java 26) | pass — 27/27; the command skips with a message when Java <21 or the Firebase CLI is missing |
| Rules regression test of the pre-fix `request.resource.size` | reproduced in the emulator before the fix, denied every write; green after FIX-01 |
| `npm run test:rules` isolation | own emulator config on ports 8180/4402, stays out of `npm run check` |

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
- `state/app` keeps the singletons; the day map moved to `state/stats` and is
  written with a plain `set`. `merge: true` merges nested maps key-by-key, so
  days pruned by the cap would otherwise stay on the remote forever.
- The pull cursor lives in `SyncStateStore`, not in `AppState.syncedAt`: one is
  "what the remote has shown me", the other "what I have sent". A single
  timestamp cannot express both after a partial or incremental sync.
- The push ledger (collection/id → confirmed `updatedAt`) is what lets a retry
  skip committed chunks and what lets a stale-cursor pull tombstone records the
  remote has TTL-deleted. It is cleared on account switch.
- On a full pull the remote is authoritative for records it still returns;
  records it dropped are only tombstoned locally when they were confirmed
  uploaded and not edited here since.
- Firestore rules cannot measure a document's byte size (`Resource` has only
  `__name__`, `data`, `id`), so size limits are key-count based in the rules and
  byte-based in the client (`STATE_APP_MAX_BYTES`, 400 KB).
- `@types/node` moved to `^22` because vitest 5.1 has a peer range that `^20`
  does not satisfy; installing with `--legacy-peer-deps` had broken
  `@testing-library/react`.

## Manual checklist

1. Two-device sync: sign in on Mac and Android, add a task on each while offline, reconnect both, confirm both tasks appear everywhere with no duplicate ids.
2. Same item edited on both while offline: newer `updatedAt` wins; on a tie the higher device id wins and both devices settle on it.
3. Delete a note on one device while the other edits it: the newer change wins; an older edit must not resurrect a deleted note.
4. Sign out on Android and sign in as a second Google account: the first account's notes must not appear in Firestore under the new uid.
5. Android hardware back: closes the chat sheet, palette, focus mode, then a route, then minimizes the app.
6. Haptics: toggle switches, task completion and timer end buzz on a physical device (emulators have no motor).
7. macOS: traffic lights do not overlap the nav bar; drag any empty top-bar area moves the window.

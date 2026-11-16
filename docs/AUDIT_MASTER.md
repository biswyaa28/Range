# Personal OS — master audit

**Date:** 13 Nov 2026 · **Commit:** `5a1667c` · **Mode:** audit only (no source changes)
**Scope:** `src/`, `src-tauri/`, `android/`, `firestore.rules`, configs, docs, CI.
**Targets audited:** macOS (Tauri v2), Android (Capacitor 8), web, Firebase Auth/Firestore
(`range6969`), Gemini panel, Health Connect.

Severity: **Critical** = exploitable or silent data loss · **High** = broken security/feature or
distribution blocker · **Med** = real defect with a workaround · **Low** = hardening/polish.
Every finding below was read in the source; runtime-only claims are marked **UNVERIFIED** with a
manual step.

---

## STEP 0 — previous audit status

All 33 `AUDIT.md` items were re-checked in code. No regressions.

| ID | Status | Evidence |
| --- | --- | --- |
| SEC-01 (desktop CSP) | FIXED | `src-tauri/tauri.conf.json:24` allowlists Firebase/Gemini + auth frame-src |
| SEC-02 (Android backup) | FIXED | `android/app/src/main/AndroidManifest.xml:6-7` `allowBackup=false`, `usesCleartextTraffic=false` |
| SEC-03 (rules allowlist) | FIXED | `firestore.rules:9-52` collection allowlist, per-doc shape |
| SEC-04 (AI data fence) | FIXED | `src/engines/llm/sanitize.ts:8-10`, used in `readTools.ts:28` |
| SEC-05 (macOS sign-in) | FIXED | `src-tauri/src/auth.rs:206+` PKCE+loopback; popup only on web |
| SEC-06 (google-services) | FIXED | `android/app/google-services.json` present and git-ignored |
| SEC-07 (gitignore globs) | FIXED | `.gitignore:22-30` narrowed |
| SEC-08 (npm audit) | STILL OPEN | now 7 high (was 6); all transitive `@grpc/grpc-js` under `firebase` |
| SEC-09 (fs write scope) | FIXED | `src-tauri/capabilities/default.json` adds `fs:scope` for `$DOWNLOAD`/`$DOCUMENT`/`$DESKTOP` only (MAC-01) |
| SEC-10 (FileProvider root) | WON'T FIX | unchanged Capacitor default |
| SEC-11 (AI transcript on sign-out) | FIXED | `src/App.tsx:90-95` clears `chatStore` on uid→null |
| SYNC-01 (deviceId tiebreak) | FIXED | `src/store/merge.ts:34` |
| SYNC-02 (account switch upload) | FIXED | `src/sync/engine.ts` account-change path |
| SYNC-03 (2s debounce) | FIXED | `src/sync/engine.ts:34` 15s |
| SYNC-04 / S5 (tombstone TTL) | FIXED | `src/domain/tombstone.ts`, rules accept `expireAt` |
| BUG-01 (`get_stats` order) | FIXED | `src/engines/llm/readTools.ts:100-104` sorted by date |
| BUG-02 (duplicate notice) | FIXED | `src/actions/registry.ts:922` |
| BUG-03 (error boundary) | FIXED | `src/ui/ErrorBoundary.tsx`, mounted twice in `src/App.tsx:236` |
| BUG-04 (tool results to model) | VERIFIED | `ChatPanel.tsx` tool loop, `tests/e2e/chat.spec.ts` |
| UX-01 (global rejection hook) | FIXED | `src/lib/errorReporter.ts`, installed in `src/main.tsx` (ERR-01) |
| UX-02 (rules tests absent) | FIXED | `tests/rules/…`; 32/32 pass with OpenJDK 21 first on `PATH` |
| S1 (500-op batches) | FIXED | `src/sync/batching.ts`, sequential commit + ledger |
| S2 (stats growth) | FIXED | `src/sync/appPayload.ts:97-133` cap 400 KB |
| S3 (full pull every sync) | FIXED | `src/sync/pullPlan.ts` + cursor |
| S4 (clock skew/monotonic) | FIXED | `merge.ts:57-62`, `store/stamp.ts:41` |
| S6 (rules↔payload test) | FIXED (code) / **UNVERIFIED run** | `tests/unit/syncPayloadAllowlist.test.ts` passes; emulator suite skipped |
| S7 (relative sync time) | FIXED | `SettingsView.tsx:149-168` |
| SYNC-05 (dayStats sanitize) | FIXED | `merge.ts:85-105` |
| FIX-01 (`request.resource.size`) | FIXED | rules use key counts; no `size` property |
| FIX-02 (notice identity) | FIXED | `src/sync/engine.ts` `sameState` compares `notice` |

---

## STEP 1 — commands actually run (13 Nov 2026, macOS, Node 20+; Java 17, then JDK 21)

| Command | Result |
| --- | --- |
| `npm run typecheck` | **pass** (exit 0) |
| `npm run lint` | **pass** (0 warnings, `--max-warnings 0`) |
| `npm run test` | **pass** — 68 files / **502 tests**, 4.9 s, 0 skipped |
| `npm run build` | **pass** — 132 ms; `dist` 1.3 MB; main JS 376.6 kB (114.6 kB gz) |
| `node scripts/check-motion-css.mjs` | **pass** — 8 stylesheets |
| `npm run e2e` | **pass** — **64/64**, 23.4 s, Chromium desktop + one 390px project, 0 retries |
| `cargo check` (`src-tauri`) | **pass** — finished in 2.27 s |
| `cd android && ./gradlew assembleDebug` | **pass** — `app-debug.apk` 9.77 MB |
| `cd android && ./gradlew assembleRelease` | **pass** — `app-release-unsigned.apk` 7.36 MB, **unsigned** |
| `npm run check:health-manifest` | **pass** — exactly 3 read-only health permissions |
| `npm audit` | **7 high, 0 critical** — all via `firebase` → `@firebase/firestore` → `@grpc/grpc-js` |
| `cargo audit` | **not run** — `cargo-audit` is not installed |
| `npm run test:rules` | **skipped on Java 17**; **pass on JDK 21** (32/32) after Batch 1 |
| `tauri build` / notarization | **not run** — only Command Line Tools (`xcode-select` → `/Library/Developer/CommandLineTools`), no full Xcode |
| Device tests (Android) | **not possible** — `adb devices` empty; no macOS `.app` build possible |

**Coverage gaps:** no coverage reporter is configured (no `coverage` script, no thresholds); E2E is
Chromium-only (no WebKit/WKWebView equivalent, no Firefox); one mobile width (390 px); Firestore
rules suite initially unexecuted (now 32/32 on JDK 21); no Android/iOS/macOS instrumentation; no performance
or battery measurement was taken (all perf notes below are static analysis only).

**Batch 1 re-run (13 Nov 2026):** `npm run check` pass (unit suite green, 65/65 e2e), `cargo check` pass, `./gradlew assembleDebug` pass, `check:health-manifest` pass, rules 32/32 on JDK 21.

**Skipped/flaky:** none skipped and none retried. `scripts/run-rules-tests.mjs` exits 0 on skip,
which means CI could silently skip rules forever (see DEV-01).

---

## Summary

| Area | Health /10 | Critical | High | Med | Low |
| --- | --- | --- | --- | --- | --- |
| 1 UI/UX | 7 | 0 | 0 | 4 | 2 |
| 2 Accessibility | 6 | 0 | 0 | 3 | 2 |
| 3 Database/Sync | 6 | 0 | 2 | 1 | 1 |
| 4 Errors & bugs | 7 | 0 | 0 | 1 | 0 |
| 5 macOS | 6 | 0 | 0 | 2 | 0 |
| 6 Android | 5 | 0 | 1 | 1 | 1 |
| 7 AI assistant | 8 | 0 | 0 | 2 | 0 |
| 8 Security & privacy | 6 | 0 | 1 | 0 | 2 |
| 9 Performance | 7 | 0 | 0 | 0 | 1 |
| 10 Feature completeness | 7 | 0 | 0 | 0 | 0 |
| 11 Code quality/DevOps | 7 | 0 | 0 | 1 | 2 |
| 12 Release readiness | 3 | 0 | 0 | 1 | 0 |
| **Total** | **6.3 avg** | **0** | **4** | **16** | **11** |

---

## Findings

| ID | Severity | Area | File:line | Problem | Impact | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DATA-01 ✅ Fixed | High | Sync/privacy | `src/features/settings/SettingsView.tsx:785-795`, `docs/FIREBASE_SYNC.md` §6 | "Clear all data" only replaces local state; the device stays signed in and the next sync re-pulls every cloud record, and there is no in-app remote delete. | User believes data is erased; Play data-deletion policy and GDPR/DPDP expectations unmet. | Add "Delete cloud data" (sign out, delete `users/{uid}/**` via client batch or console link) and make clear-all state which copy is removed. | M |
| DATA-02 ✅ Fixed | High | Sync/data | `src/features/notes/NotesView.tsx:409` (body has no `maxLength`), `src/sync/firebaseAdapter.ts:239` | No per-record size guard. One note >1 MiB (or imported record) makes every 500/400-op chunk fail permanently, so nothing after it syncs. | Silent sync wedge with a generic "Sync failed" message; data stays local-only. | Cap note body/record bytes client-side (e.g. 200 KB) before push, surface an actionable error, skip and quarantine oversized records. | S |
| SEC-01 ✅ Fixed | High | Privacy/release | `android/app/src/main/res/values/strings.xml:7-8`, `docs/privacy-policy.md` | Health Connect privacy URL is `https://example.com/personal-os/privacy-policy` (own TODO on line 7) and the policy covers **only** health data, not Google account, synced notes/tasks, or Gemini requests. | Health Connect declaration and Play listing reject placeholder URLs; policy is materially incomplete. | Host the policy on an HTTPS domain, point the string and Settings at it, add sections for Firebase sync, Gemini (what is sent, BYO key), retention and deletion. | S |
| AND-01 ✅ Fixed (`1ebe801`) | High | Android/release | `android/app/build.gradle:20-23` | No `signingConfig`; `assembleRelease` yields `app-release-unsigned.apk`, no AAB, `minifyEnabled false`. | Cannot publish or sideload a trusted release build; Play requires a signed AAB. | Add a release keystore via `keystore.properties` (git-ignored), `signingConfigs.release`, `bundleRelease`, enable R8 with keep rules. | M |
| UX-01 ✅ Fixed | Med | UI/feature | `src/features/settings/SettingsView.tsx:1161-1169`, `src/features/plan/CalendarView.tsx:89,221,745` | Week-start setting (Mon/Sun/Sat) is stored and mirrored to `data-week-start`, but the calendar always renders Monday-first. | A shipped setting silently does nothing; Sunday-week users misread the grid. | Thread `weekStart` through `weekDates`, month grid and day headers, or remove the control. | M |
| UX-02 ✅ Fixed | Med | UI/feature | `src/features/settings/SettingsView.tsx:1230-1265`, manifest (no `POST_NOTIFICATIONS`) | Notification master switch, deadline/task reminders and quiet hours are persisted but no notification code, plugin, permission or scheduler exists. | Users enable reminders that never fire; promises in Settings copy are false. | Implement local notifications (Capacitor LocalNotifications + macOS `UNUserNotificationCenter`) or hide the group behind "coming soon". | L |
| UX-03 ✅ Fixed | Med | UI/feature | `src/domain/settings.ts:96`, `src/store/applySettings.ts:96` | Clock-format setting (12h/24h) is persisted to a `data-clock` attribute that nothing reads; every time label is 24h. | Shipped setting has no effect. | Add a `fmtClock()` helper honouring the setting, or remove the control. | S |
| UX-04 ✅ Fixed | Med | UI/UX | `index.html:1-18`, `src/App.tsx:99` | Theme is applied in an effect after first paint; no pre-paint bootstrap script. | White flash on every launch for dark-theme users, worst on Android cold start. | Inline a tiny blocking script in `index.html` that reads `personalOS_v1`/settings and sets `data-theme` before CSS paints. | S |
| UX-05 ✅ Fixed (`ef555d3`) | Low | UI/copy | `src/features/onboarding/Onboarding.tsx:449` vs `src/features/plan/ImportTimetableModal.tsx:301` | Onboarding promises "Upload CSV or JSON"; the importer accepts `.json` only and parses JSON only. | Dead-end copy; user drops a CSV and fails. | Change copy to JSON, or implement CSV parsing in `timetableImport.ts`. | S |
| UX-06 ✅ Fixed (`edf9210`) | Low | UI/nav | `src/features/shell/BottomTabBar.tsx:12-18` | Mobile tab bar has 5 items; Insights and Settings only exist in the avatar menu. | Discoverability gap on phones. | Add a "More" sheet or a 6th tab. | S |
| A11Y-01 ✅ Fixed (`0e41d27`, `c449c09`) | Med | Accessibility | `src/App.tsx:229-241`, `src/hooks/useHashRoute.ts` | No route-level `document.title`, no focus move to the view heading, no skip link. | Screen-reader and keyboard users get no route announcement; tab order starts at the nav every time. | Set `document.title` per route, focus the `<h1>` (`tabIndex=-1`) after navigation, add a skip-to-content link. | S |
| A11Y-02 ✅ Fixed (`c707303`) | Med | Accessibility | `src/styles/components.css:140,663`, `src/features/shell/TopNav.css:107` | Icon buttons and secondary buttons are 36×36 / 36 px high; several chips/segments are ~31 px. | Below the 44×44 target; misses on phones and motor-impaired users. | Raise interactive minimums to 44 px (or add invisible hit-area padding). | S |
| A11Y-03 ✅ Fixed (`542aba6`, `c449c09`) | Med | Accessibility | `tests/e2e/accessibility.spec.ts:60-70` | Axe gate fails only on `serious`/`critical`; there is no automated keyboard/focus-trap regression test for palette, chat, focus mode, prompter. | Moderate WCAG issues and focus-trap regressions can ship green. | Include `moderate` (or a curated rule set) and add keyboard E2E coverage for each overlay. | M |
| A11Y-04 ✅ Fixed (`09b1952`, `2aa08b1`) | Low | Accessibility | `src/styles/components.css:780` | White check glyph on `#34C759` is ≈2.1:1, below the 3:1 non-text minimum. | Done state is hard to perceive for low-vision users. | Use `--text`/dark glyph or a darker green for the checkbox fill. | S |
| A11Y-05 ✅ Fixed (`9f9cd68`) | Low | Accessibility | `src/hooks/useShortcuts.ts:130`, `src/features/shortcuts/CheatSheet.tsx` | Shortcut labels say "Ctrl K" while macOS matches Meta too. | Wrong modifier shown on macOS. | Render `⌘` on macOS and `Ctrl` elsewhere. | S |
| DATA-03 ✅ Fixed (`328c0d5`) | Med | Sync/cost | `src/sync/firebaseAdapter.ts:179-195` | Pull issues `getDocs` on four collections with no `limit`/pagination, plus a forced full pull every 24 h. | Large histories re-read thousands of docs daily; risks Spark 50k/day reads across 2–3 devices. | Page pulls at ~300 docs (`limit` + `startAfter`) and surface a quota warning. | M |
| DATA-04 ✅ Fixed | Low | Sync/rules | `firestore.rules:24-38` | `recordShape` does not require `id`/`updatedAt` and allows up to 40 arbitrary keys; no server-side byte cap (unavoidable in rules). | A malformed/oversized owner write is accepted and then has to be handled by every client. | Require `id`, `updatedAt`, `createdAt` and an allowlist of keys per collection; keep the client byte cap. | S |
| ERR-01 ✅ Fixed | Med | Errors | `src/main.tsx:1-31` | No `window.addEventListener('unhandledrejection'/'error')`; only per-call catches. | Fire-and-forget promise failures (storage, Firebase, audio) are invisible and unreportable. | Add a global handler that logs redacted context and shows a toast once per session (AUDIT UX-01). | S |
| MAC-01 ✅ Fixed | Med | macOS | `src-tauri/capabilities/default.json:11`, `src/platform/tauri.ts:9-16` | `fs:allow-write-file` is granted with no `fs:scope` path. In Tauri v2 the dialog does not widen the fs scope. | Backup export via "Save…" can fail at runtime with "forbidden path". **UNVERIFIED** — needs a signed local build. | Add a narrow scope (e.g. `$DOWNLOAD/**`, `$DOCUMENT/**`) or write via a Rust command that takes the dialog path. | S |
| MAC-02 ✅ Fixed (`4cb91a6`) | Med | macOS/release | `src-tauri/tauri.conf.json:37-52`, `src-tauri/Cargo.toml:4-8` | No signing identity, hardened runtime, notarization or updater; bundle metadata is the Tauri default (`authors=["you"]`, description "A Tauri App", empty license). | Gatekeeper blocks distribution; no security updates; About box shows placeholder data. | Configure Developer ID signing + notarization, add `tauri-plugin-updater`, fill metadata. | L |
| AND-02 ✅ Fixed (`044d6a2`) | Med | Android | `android/variables.gradle:4`, `src/platform/capacitor.ts:239-247` | `targetSdk 36` enforces edge-to-edge on Android 15+, but there is no inset handling; `StatusBar.setBackgroundColor` is deprecated/no-op there. | Status/navigation bars may overlap the top nav and tab bar on Android 15/16. **UNVERIFIED** (no device). | Apply system-bar insets (Capacitor `SystemBars`/`@capacitor/status-bar` overlay config) and pass insets to CSS vars. | M |
| AND-03 ✅ Fixed (`4e3ddd2`) | Low | Android | `android/app/src/main/res/values/strings.xml:5`, manifest (no intent-filter) | `custom_url_scheme` is defined but no deep-link intent filter or `appUrlOpen` handler exists. | Capability is advertised in resources but unusable. | Add an App Link/intent filter plus `CapApp.addListener('appUrlOpen')`, or drop the string. | M |
| AI-01 ✅ Fixed | Med | AI | `src/engines/llm/readTools.ts:100-113` | `get_stats` accepts `range` but always sorts and `slice(-7)`; it then prints `Range: month/year`. | Model reports 7-day totals as a month/year total; wrong answers about progress. | Map range→window (`week` 7, `month` 30, `all`) and report the actual window. | S |
| AI-02 | Med | AI privacy | `src/store/chatStore.ts:25-30,77-86`, `src/domain/chat.ts:8` | Transcript (which can quote note snippets) is plaintext in `localStorage` under `personalOS_chat_v1` and is only cleared on explicit sign-out or Clear. | Any local profile/extension or shared-browser user can read quoted private notes. | Don't persist tool/note-derived message bodies; or move the transcript to the encrypted secure store and clear on sign-out *and* on browser close. | M |
| SEC-02 ✅ Fixed (`c027e8b`) | Low | Security/deps | `package.json` | `npm audit`: 7 high, all transitive through `firebase` → `@grpc/grpc-js` (no direct exploitable path in this app). | Vulnerable gRPC code ships in the bundle; no upstream fix without a breaking downgrade. | Track upstream Firestore releases; document the exception in `SECURITY.md`; re-run at each release. | S |
| SEC-03 ✅ Fixed (`3469878`) | Low | Security | `src/platform/web.ts:176-205` | Web "secure" vault keeps the AES key in the same IndexedDB as the ciphertext (non-extractable, but same-origin scripts can decrypt). | XSS or a malicious extension can recover the Gemini key on web. Documented as best-effort. | Keep native Keychain/Keystore as the only "secure" claim; label web storage "obfuscated" or require re-entry per session. | M |
| PERF-01 ✅ Fixed (`ca7e9f2`) | Low | Performance | `src/features/tasks/TasksView.tsx:574`, `src/features/notes/NotesView.tsx:292` | Task and note lists render every record; no virtualization or windowing. | Jank and memory growth with 1,000+ tasks/notes on low-end Android. | Virtualize long lists (or paginate closed/completed groups). | M |
| DEV-01 ✅ Fixed (`55db306`) | Med | DevOps | `.github/workflows/ci.yml:1-40` | CI runs only typecheck/lint/unit/build/CSS scan: no E2E, no rules emulator, no `cargo check`/`cargo audit`, no Gradle build, no dependency audit. | Platform and security regressions merge green; the rules suite is silently skippable. | Add jobs for e2e (with `npm run e2e`), rules (Java 21), `cargo check`/`audit`, `assembleDebug`, `npm audit --audit-level=high`. | M |
| DEV-02 ✅ Fixed (`16d44d4`) | Low | DevOps | `package.json:4`, `src-tauri/tauri.conf.json:4`, `android/app/build.gradle:11` | Version drift: `0.1.0` in package/Tauri, `1.0` `versionName` and `versionCode 1` on Android. | Confusing release/version mapping; no changelog to reconcile. | Single-source the version (build script) and add `CHANGELOG.md` + tag-based release workflow. | S |
| DEV-03 ✅ Fixed (`1ad7863`) | Low | Repo | repo root, `src-tauri/Cargo.toml:4-8` | No `LICENSE`; Cargo metadata placeholders; `skills-lock.json` (agent tooling) is tracked; no Git remote configured. | "All rights reserved" by default; no backup/CI integration; all 60 commits exist only locally. | Add a license, clean Cargo metadata, decide whether agent files belong in git, add `origin`. | S |
| DEV-04 ✅ Fixed (`fd48e21`, `1b2e75d`) | Low | Repo | `CHANGELOG.md`, `skills-lock.json`, `README.md` | No changelog, agent skills state tracked, release/install/privacy docs incomplete. | Release history and hygiene unclear. | Add Keep a Changelog 1.0.0, untrack agent tooling, document install/release/privacy and remote commands. | S |
| REL-01 ✅ Fixed (`a131974`) | Med | Release | repo-wide | No crash reporting, no analytics, no store assets/screenshots/description, no Data Safety answers, no AAB. | Launch is blocked and post-launch failures are invisible. | Add Sentry (free tier) or Crashlytics, a privacy-respecting analytics choice, and prepare Play/App Store listings + Data Safety. | L |

---

## Batch 1 status (13 Nov 2026)

| ID | Status | Commit | What changed |
| --- | --- | --- | --- |
| DATA-01 | FIXED | `0790af2` | Settings separates **Clear data on this device** from **Delete my cloud data**. The cloud action lists `users/{uid}` (4 collections + `state/app|stats|preferences`), deletes in batches of 400 with progress, clears local data, signs out, and offers Retry on failure. Unit tests mock the adapter; e2e covers the renamed device-clear modal. `docs/FIREBASE_SYNC.md` documents the split. |
| DATA-02 | FIXED | `dad8ec8` | Note bodies cap at 200,000 chars (textarea `maxLength` + counter, store/import clamp, import toast). Push estimates JSON bytes per record; anything over 900,000 is skipped, listed in sync status as unsyncable (id, title, size), and never blocks the rest. Tests cover a 1.2 MB note. |
| SEC-01 | FIXED | `d03d9d6` | Policy rewritten (Google account, Firestore contents, Gemini + private notes, Health Connect, BYO key, deletion, `{EMAIL}`) and shipped as self-contained `docs/privacy.html` with README hosting steps. Android URL comes from `PRIVACY_POLICY_URL` via `resValue`; the health-manifest guard fails on `example.com`. Settings has a Privacy policy link from `src/config/links.ts`. |
| MAC-01 | FIXED (runtime UNVERIFIED) | `2f7df37` | `fs:scope` allows only dialog-chosen paths plus `$DOWNLOAD`, `$DOCUMENT`, `$DESKTOP`; no `$HOME` wildcard. `cargo check` passes. Export/import steps recorded in `docs/NATIVE.md`; needs one signed local build to confirm. |
| DATA-04 | FIXED | `00b3e5c` | Rules require a string `id` matching the doc id and a non-empty string `updatedAt` (ISO strings, not numeric — that is what the app writes), keep the 40-key cap, allow owner deletes for the cloud wipe, and reject extra state docs. Emulator suite: 32/32 pass on JDK 21. |

Rules verification gap closed: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 npm run test:rules` → 32 passed.

## Batch 5 status (16 Nov 2026)

| ID | Status | Commit | What changed |
| --- | --- | --- | --- |
| PERF-01 | FIXED | `ca7e9f2` | Measured virtual list in Tasks, Notes, Deadlines and AI chat; below 100 items renders normally. 5,000-task Playwright run renders 19 DOM rows, initial 264 ms (dev), bottom reachable. Baseline in `docs/PERFORMANCE.md`. |
| DATA-03 | FIXED | `328c0d5` | Pulls page 300 documents at a time in `updatedAt, documentId` order, checkpoint after each page, resume at the failed page, and show a local daily read count against 50k. |
| FEAT-01 | DONE | `5b78de8` | Ranked search with highlighted terms, private-note flag, arrow/Enter selection and deep links. Ranking unit tests plus desktop/mobile e2e. |
| FEAT-02 | DONE | `a0628e8` | Opt-in safe Markdown preview (headings, emphasis, lists, checklists, code, validated links), no raw HTML, external links via system browser, per-note/all-note `.md` export. |
| FEAT-03 | DONE | `1539214` | Habits with daily/weekday schedules, check-ins on Home and Plan, streaks, weekly heatmap, reminders, migration/backup/LWW tombstones, paged sync, rules shape checks. |
| FEAT-04 | DONE (device UNVERIFIED) | `2837ae7` | Android Today widget and `ACTION_SEND` quick-add target; JSON snapshot in SharedPreferences. Mac `Cmd+Shift+Space` skipped: `tauri-plugin-global-shortcut` is not part of this build. |
| SEC-03 | FIXED | `3469878` | Optional PBKDF2-SHA-256 + AES-GCM passphrase layer for the web AI key; default remains no passphrase; locked/unlock/replace states tested with injectable fake WebCrypto. |

## Feature gaps vs original goals

| Goal | Status | Evidence / gap |
| --- | --- | --- |
| Timetable upload | **PARTIAL** | JSON array/file import in Plan and onboarding (`ImportTimetableModal.tsx:268-301`, `domain/timetableImport.ts`). No CSV, PDF or screenshot/OCR import despite onboarding copy. |
| Time blocks turn green when done | **DONE** | `domain/recurrence.ts:24-45`, `styles/components.css:205-212,334-336` (`--green-tint`, green tick). |
| Stats / progress | **DONE** | `features/insights/InsightsView.tsx` (streak, completion, weekly activity, honest empty state), `domain/stats.ts`. |
| To-dos | **DONE** | `features/tasks/TasksView.tsx` — quick add parser, priorities, due dates, filters, swipe, undo. |
| Notes | **DONE** | `features/notes/NotesView.tsx` — plain-text storage, search, pin, private flag, split pane, safe Markdown preview (no raw HTML), per-note and all-note `.md` export. |
| Tracker | **DONE** | Daily/weekday habits with Home/Plan check-ins, current/longest streaks, weekly Insights heatmap, optional reminders and synced tombstones (`domain/habits.ts`, `features/habits/HabitStrip.tsx`). |
| Instant search | **DONE** | Ranked, highlighted, keyboard-first search across tasks, notes, timetable and deadlines; private notes stay searchable and flagged (`domain/search.ts`, `features/home/SearchBar.tsx`). |
| Android widget / share | **DONE (device UNVERIFIED)** | Today widget (next 3 blocks + due tasks) reads a local SharedPreferences snapshot; shared text becomes a quick-added task. Manual steps in `docs/ANDROID_WIDGET.md`. |
| Prompter | **DONE** | `features/focus/PrompterPanel.tsx` with keyboard controls and reading mode. |
| Noise player (white/brown/pink) | **DONE** | `engines/noise.ts` synthesises all three live, no assets/network. |
| Gmail summary via `gog` | **MISSING** | No Gmail/`gog` code anywhere; `src/integrations/` is README-only. |
| Assignments/exams/announcements fetch | **MISSING** | Deadlines are manual (`DeadlinesView.tsx`); no fetch/import source. |
| Google Classroom (view, submit) | **MISSING** | No Classroom code or OAuth scopes beyond sign-in. |
| Google Fit & Samsung Health | **PARTIAL** | Health Connect read-only steps/sleep/active calories on Android (`platform/healthConnect.ts`); no Fit API, no Samsung SDK (Samsung Health only via Health Connect sync). |
| Android↔Mac sync | **DONE** | LWW + tombstones + deviceId tiebreak + incremental pull (`src/sync/*`, `src/store/merge.ts`); health data never syncs. |
| Settings & customisation | **DONE** | Theme/accent/font/density/motion/home widgets, week start, clock format and local notifications all drive behaviour (UX-01/02/03). |
| In-app AI | **DONE** | Gemini 2.5 Flash streaming, read tools, propose→confirm→apply→undo, BYO key in Keychain/Keystore (`engines/llm/*`, `actions/registry.ts:912-980`). |

### Top 10 high-value, free additions
1. Local reminders/notifications for deadlines + daily review (Capacitor LocalNotifications; free).
2. Android home-screen widget for today's next class/tasks (Glance, no server).
3. Share-target / quick-capture (Android share sheet + macOS Services) into tasks/notes.
4. ICS/CSV timetable + calendar import (works with college portals), plus PDF text extraction on-device.
5. Read-only Gmail/Classroom via Google API with incremental sync — assignments and deadlines land automatically.
6. In-app weekly review digest (local computation; reuses Insights data).
7. Global search upgrade: search inside note bodies, deadlines and commands in one palette (already close).
8. Crash reporting free tier (Sentry or Crashlytics) + privacy-respecting analytics (self-hosted Umami/Plausible).
9. End-to-end export/import hardening: scheduled auto-backup to Files/Downloads.
10. Desktop polish: menu-bar quick capture, Cmd+, Preferences, global shortcut, Dock badge for due items.

---

## Verified working (solid)

- Build/lint/type gate: strict TS (`noUncheckedIndexedAccess`), **zero `any`**, zero `@ts-ignore`, lint clean.
- 502 unit + 64 Playwright tests green; axe matrix covers 7 routes × 2 themes × 2 viewports with 0 serious/critical violations.
- LWW conflict resolution: monotonic local stamps, 5-minute clock-skew clamp, `deviceId` tiebreak, canonical-JSON tiebreak for singletons/day stats (`merge.ts`).
- Sync hardening: 400-op chunked pushes with a ledger, incremental pull with overlap, daily full pull, 90-day tombstone TTL, stats cap at 400 KB, account-switch upload guard.
- Firestore rules: owner-only, explicit collection allowlist, shape/type checks, no hard deletes, AI key rejected from preferences.
- Local persistence: schema v2 migration, corrupt-save backup key, debounced writes, quota failure banner with export/retry, `pagehide` flush.
- AI safety: note text fenced and fence tokens stripped, private notes excluded from tools and prompts, read access off by default, tool-call round cap (5), typed errors with friendly copy, propose→confirm→apply→undo with a toast undo, key in Keychain/Keystore (never in the bundle).
- Security posture: no `dangerouslySetInnerHTML`/`innerHTML`/`eval`, no secrets in `dist` (only the public Firebase web key, which is by design), CSP locked to Firebase/Gemini hosts, Android backup/cleartext disabled, health permissions pinned to 3 reads by a failing guard.
- Error recovery: app-level + route-level error boundaries with reload, storage-failure banner, chat retry/stop, sync retry with offline detection.
- Undo everywhere it matters: task delete, note delete, block delete, AI action undo.
- Responsive shell: lazy routes, safe-area padding, reduced-motion honored in CSS and JS, 390 px layout has no horizontal overflow.
- macOS auth: PKCE + loopback, state validation, 120 s timeout, cancel, no token logging.
- Android: minSdk 26 (Android 8), target 36, back button priority chain, haptics gated by setting, Health Connect availability/permission flow.

---

## Prioritized roadmap (one batch ≈ one agent session)

**Batch 1 — security, privacy, data loss (ship-blocking) — DONE 13 Nov 2026**
DATA-01, DATA-02, SEC-01, MAC-01, DATA-04 fixed; rules suite runs 32/32 on Java 21. Remaining follow-up: confirm macOS backup export on a signed local build (MAC-01 runtime).

**Batch 2 — broken features and correctness — DONE 14 Nov 2026**
UX-01 (week start), UX-03 (clock format), UX-02 (local notifications), AI-01 (`get_stats` range), UX-04 (pre-paint theme) and ERR-01 (global handler) fixed. AND-02 (edge-to-edge insets) still open; it needs a device or emulator.

**Batch 3 — accessibility and UX polish — DONE 15 Nov 2026**
A11Y-01 (titles/focus/skip link), A11Y-02 (44 px targets, inline text links excepted), A11Y-03 (axe moderate across 4 viewport/theme runs plus palette/chat/focus/prompter/onboarding keyboard tests), A11Y-04 (accent text/focus contrast plus dark completion glyph), A11Y-05 (⌘/Ctrl labels), UX-05 (CSV import with template) and UX-06 (More tab sheet) fixed. Remaining manual checks: VoiceOver on macOS and TalkBack on Android.

**Batch 4 — release engineering — DONE 15 Nov 2026**
AND-01 (keystore/env signing, AAB + APK, R8), AND-02 (native insets + safe-area vars), AND-03 (`personalos://` links), MAC-02 (bundle metadata + signed updater + Settings check), REL-01 (opt-in redacted crash reports, privacy policy, store kit), DEV-01 (full CI + tag release), DEV-02/03/04 (version sync, MIT, changelog, docs), SEC-02 (gRPC override; `npm audit` clean). Remaining manual checks: device edge-to-edge, VoiceOver/TalkBack, and a signed Play upload. macOS build succeeds here with `--debug`; a full `tauri build` needs Xcode.

**Batch 5 — performance and new value — DONE 16 Nov 2026**
DATA-03 (paged pulls), PERF-01 (virtualized lists), FEAT-01 (search), FEAT-02 (Markdown/export), FEAT-03 (habits), FEAT-04 (widget/share), SEC-03 (passphrase vault). AI-02 (transcript protection) remains open. Manual checks: Android widget/share on a device.

---

## Manual test checklists (no device available here)

**Android physical device (Android 8, 13, 15; Samsung + Pixel)**
1. Cold start in dark mode: no white flash; splash → app background continuity.
2. Android 15/16: status bar and gesture bar do not overlap the top nav or tab bar; keyboard does not cover the chat input (resize body).
3. Hardware back: chat → palette → focus mode → dialog → route → minimize (in that order).
4. Health Connect: install, grant 3 permissions, see steps/sleep/calories; revoke in Health Connect and confirm the app shows "denied"/"unavailable" without crashing.
5. Google sign-in with release build + Play App Signing SHA-1; sign out and back in; account switch shows no old-account documents.
6. Haptics on toggle/complete/timer end; honors the Settings switch.
7. Rotation while a modal and the chat sheet are open; no lost input.
8. Notifications: master switch prompts for permission on Android 13+; denial flips it back off with a hint; allow one block/deadline/task reminder and confirm it fires outside quiet hours without note text.
9. Low-end device: 500 tasks/notes scroll; check jank and memory.
10. `adb backup` / Google backup contains no app data; `aapt dump badging` shows expected permissions.

**macOS (signed local build)**
1. Traffic lights do not overlap the brand; dragging any empty top-bar area moves the window.
2. Backup export via the save dialog (MAC-01): confirm the file is written and no "forbidden path" error.
3. Google sign-in: system browser opens, cancel path, 120 s timeout, success returns to app; token never appears in logs.
4. Cmd+K, Cmd+Shift+F, Cmd+Q, Cmd+, (currently absent) and menu Edit actions work.
5. Notifications: master switch triggers the macOS permission prompt; allow and confirm a scheduled reminder arrives.
5. Keychain: save AI key, relaunch, key persists; remove key clears it.
6. Offline: edit a task, quit, relaunch — data intact; reconnect syncs.
7. Dark mode: no flash on launch; window resize to 390 px min width has no horizontal overflow.

---

## UNVERIFIED (explicit)
- Firestore rules behaviour under unauthenticated/other-user/malformed writes (emulator not runnable here).
- MAC-01 backup export at runtime; Tauri build/notarization/Gatekeeper.
- AND-02 edge-to-edge insets, Health Connect permission dialogs, native Google sign-in, haptics, doze/background behaviour, WebView version matrix, Samsung quirks.
- Real-device performance, battery and memory; startup timings.
- `cargo audit` (tool not installed) and the Kotlin-metadata warnings seen during the first release build (the second run was a clean `BUILD SUCCESSFUL`).

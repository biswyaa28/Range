# Personal OS

A local-first personal dashboard: plan the week, track tasks and deadlines,
write notes, run focus sessions, review insights, and chat with an AI assistant.
Data lives in the browser/app storage first; Firebase sync is optional and
owner-only. The same Vite/React build runs on the web, macOS (Tauri) and Android
(Capacitor).

## Stack

- Vite, React 18, TypeScript (strict)
- No Tailwind, UI component library, router library or state library
- Hash routes (`#home`, `#plan`, `#tasks`, `#notes`, `#focus`, `#insights`,
  `#settings`, plus `#deadlines` and `#prompter`)
- State via `useSyncExternalStore` over the Store module
- Optional Firebase Auth + Firestore sync (last-write-wins, tombstones)
- Vitest for unit tests, Playwright for end-to-end tests
- Zod for payload validation

## Setup

Requirements: Node 20+ and npm. Native shells additionally need Rust/Xcode
(macOS) or JDK 21+/Android Studio (Android).

```sh
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` is git-ignored. Sync stays disabled when the Firebase keys are
missing, and the rest of the app remains fully local.

### Environment keys

| Key | Required | Purpose |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | for sync | Firebase web app API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | for sync | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | for sync | Firestore project id |
| `VITE_FIREBASE_APP_ID` | for sync | Firebase web app id |
| `VITE_FIREBASE_STORAGE_BUCKET` | no | Accepted for compatibility; sync does not use it |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | no | Accepted for compatibility; sync does not use it |
| `GOOGLE_DESKTOP_CLIENT_ID` | macOS sign-in | Desktop OAuth client id (never `VITE_`-prefixed) |
| `GOOGLE_DESKTOP_CLIENT_SECRET` | macOS sign-in | Desktop OAuth secret, read by `build.rs` only |
| `VITE_GOOGLE_DESKTOP_CLIENT_ID` | no | Legacy fallback still read by `build.rs` |

Android sign-in also needs `android/app/google-services.json` and a registered
signing SHA-1. The AI key is entered in Settings and stored in the platform
secure store (Keychain/Keystore); it is never an environment variable and never
syncs. Full console steps: [`docs/AUTH.md`](docs/AUTH.md) and
[`docs/FIREBASE_SYNC.md`](docs/FIREBASE_SYNC.md).

### Hosting the privacy policy

[`docs/privacy.html`](docs/privacy.html) is a self-contained page (no build,
no assets). To publish it on GitHub Pages: **Settings → Pages → Deploy from a
branch**, pick `master` and the `/docs` folder; the URL becomes
`https://<user>.github.io/<repo>/privacy.html`. On Firebase Hosting's free
Spark plan, `firebase init hosting`, set the public directory to `docs`, then
`firebase deploy --only hosting`.

That URL is the single source of truth: set it in
[`src/config/links.ts`](src/config/links.ts) and, for Android, in the
`PRIVACY_POLICY_URL` environment variable consumed by
`android/app/build.gradle` (a default is baked in). `npm run check:health-manifest`
fails if a placeholder `example.com` URL returns.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck and build the production bundle to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint with zero warnings allowed |
| `npm run test` | Vitest unit/component suite |
| `npm run test:rules` | Firestore rules emulator suite; skips when Java 21+/Firebase CLI is missing |
| `npm run e2e` | Playwright end-to-end suite |
| `npm run check` | Typecheck, lint, unit tests, build, motion-CSS scan, then e2e |
| `npm run tauri:dev` | Run the macOS desktop shell in development |
| `npm run tauri:build` | Build the macOS `.app` and DMG |

CI runs typecheck, lint, unit tests, build and the motion-CSS scan only; e2e and
the rules emulator stay local.

## Platform builds

- **Web** — `npm run build`, then deploy `dist/`. Firebase Hosting is optional.
- **macOS (Tauri v2)** — `npm run tauri:build` produces
  `src-tauri/target/release/bundle/macos/Personal OS.app` and a DMG under
  `src-tauri/target/release/bundle/dmg/`. Local builds are unsigned.
- **Android (Capacitor)** — `npm run build && npx cap sync android`, then
  `cd android && ./gradlew assembleDebug`. The APK is
  `android/app/build/outputs/apk/debug/app-debug.apk`.
  `npx cap open android` opens Android Studio.

Details and first-launch notes: [`docs/NATIVE.md`](docs/NATIVE.md).

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — directory layout, data flow and core principles
- [`docs/AUTH.md`](docs/AUTH.md) — Google sign-in for web, macOS and Android, including SHA-1 setup
- [`docs/FIREBASE_SYNC.md`](docs/FIREBASE_SYNC.md) — Spark project setup, Firestore layout and sync behavior
- [`docs/NATIVE.md`](docs/NATIVE.md) — Tauri macOS and Capacitor Android builds
- [`docs/OPS.md`](docs/OPS.md) — rules deploy, tombstone TTL and quota operations
- [`docs/SYNC_TEST.md`](docs/SYNC_TEST.md) — two-device sync verification checklist
- [`docs/README.md`](docs/README.md) — documentation conventions

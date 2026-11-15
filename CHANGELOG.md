# Changelog

All notable changes to Personal OS are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-11-15

First public release.

### Added

- Local-first dashboard with timetable, tasks, deadlines, notes, insights and
  a focus timer, all stored in the browser/app storage first.
- Optional Google sign-in and private Firestore sync with last-write-wins
  conflict resolution and tombstones.
- Optional AI assistant (Gemini, Groq, OpenRouter) with an on-device key and
  notes access off by default.
- Focus sounds, teleprompter reading mode, full-screen focus mode and wake lock.
- Insights for streaks, completion trends and optional read-only Health
  Connect steps, sleep and active calories.
- Timetable CSV import (`day,start,end,title,type`) with a downloadable
  template, plus JSON backup/export/restore.
- Nine accent themes, light/dark/system appearance, density and motion settings.
- Keyboard shortcuts, command palette, skip link, route titles and announcements.
- Android app with edge-to-edge insets, `personalos://` deep links, 44 px touch
  targets, Health Connect privacy URL and release signing/R8 configuration.
- macOS app (Tauri v2) with DMG, ad-hoc first-run support, Developer ID signing
  and notarization steps, and signed updates via a GitHub Releases endpoint.
- Opt-in anonymous crash reports (redacted error only) and local diagnostics.
- Full CI matrix (typecheck, lint, unit, build, e2e, rules emulator, Rust,
  Android, dependency audits) and a tag-driven release workflow.
- Store listing kit, Data safety answers and privacy policy covering sync, AI,
  health data and crash reports.

### Fixed

- Under-44 px touch targets on coarse pointers, low-contrast accent text and
  focus rings, missing dialog focus traps and keyboard coverage.
- Deprecated Android status-bar background handling on target SDK 36.
- Version drift between package, Tauri, Cargo and Android.
- Health Connect manifest scopes are limited to the three read-only permissions.

### Security

- Health Connect scopes restricted by manifest merge rules and guarded in CI.
- Android backups and cleartext traffic disabled; API keys stay in the platform
  secure store and never sync.
- No third-party analytics or tracking SDKs.

## [0.1.0] — 2026-11-07

Initial private scaffold: Vite/React/TypeScript app, hash routing, local store,
Firebase sync and native shells.

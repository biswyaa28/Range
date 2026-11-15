# Store listing kit — Personal OS 1.0.0

## Title

- Play (30 chars): `Personal OS — plans & focus`
- Mac App Store (30 chars): `Personal OS: plans & focus`

## Short description (Play, 80 chars)

`Local-first timetable, tasks, notes and focus timer. Sync and AI are optional.`

## Full description

Personal OS is a calm, local-first dashboard for your day. It keeps your
timetable, tasks, deadlines, notes and focus sessions in one place, and works
without an account.

Everything is stored on your device first. Optional Google sign-in syncs your
data privately to your own Firebase account, and the AI assistant only runs
after you add your own API key.

- **Timetable** — weekly blocks, drag to move, CSV/JSON import with a template.
- **Tasks and deadlines** — priorities, due dates, completion history.
- **Notes** — fast capture, search, pinning.
- **Focus** — Pomodoro, sounds, a teleprompter and full-screen focus mode.
- **Insights** — streaks, completion trends and optional Health Connect steps,
  sleep and active calories (read-only, never stored or synced).
- **Private by design** — no ads, no tracking, no analytics SDK. Sync and AI are
  off until you turn them on.

## Feature bullets

- Offline-first timetable, tasks, notes and deadlines
- Pomodoro, focus sounds and teleprompter
- Optional end-to-end account sync (last-write-wins)
- Optional AI assistant with your own key, notes opt-in
- Read-only Health Connect insights (Android)
- Light/dark themes, 9 accents, keyboard shortcuts, screen-reader support
- CSV import and full JSON backup/restore

## Keywords

`personal organizer, timetable, schedule, tasks, to-do, notes, focus timer,
pomodoro, study planner, local first, offline, privacy, student planner`

## Release notes — v1.0.0

First public release: timetable, tasks, deadlines, notes, focus timer and
teleprompter, insights with optional Health Connect, private Google sync and an
opt-in AI assistant. Android edge-to-edge support, deep links, CSV import,
44 px touch targets, WCAG AA contrast, and opt-in anonymous crash reports.

## Screenshot shot list

Capture at 390×844 (mobile) and 1280×800 (desktop), light and dark.

1. Home — greeting, today's timetable and task summary.
2. Plan — week grid with coloured blocks.
3. Tasks — grouped list with priorities and completed items.
4. Notes — note list and open editor.
5. Focus — running Pomodoro with ring.
6. Insights — streak and completion charts.
7. Settings — Appearance with accent swatches.

Store sizes: Play phone 1080×1920 or 1440×2560 (min 320 px, max 3840 px),
7-inch tablet 1200×1920, 10-inch 1920×1200. Mac App Store 1280×800, 1440×900,
2560×1600 or 2880×1800 (16:10). Use light mode for the first three, dark for
the rest. No device frames or added text beyond the app UI.

A Playwright capture script is not included; capture from the running app at the
sizes above to avoid synthetic screenshots.

## Data safety answers (Play)

Match `docs/privacy-policy.md` exactly.

- **Data collected:** App activity (timetable/tasks/notes you choose to sync);
  Personal info (name and email, only with Google sign-in); Health data (steps,
  sleep, active calories, read-only via Health Connect).
- **Purpose:** App functionality and account sync. No advertising, profiling or
  sale.
- **Shared with third parties:** Firebase (Google) as hosting/database and Auth
  provider; Google Gemini only for AI messages you send with the feature on.
  Health data is never shared.
- **Encrypted in transit:** Yes (HTTPS/WSS).
- **Deletion:** In-app "Delete my cloud data" deletes every document under
  `users/{uid}`; local data can be cleared separately.
- **Crash reports:** Optional and off by default. Error name/message/stack,
  app version, platform only. No user content.
- **Data safety / content rating:** no ads, no purchases, no public
  user-generated content; expect Everyone / PEGI 3.

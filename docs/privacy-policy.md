# Privacy policy

**App:** Personal OS
**Effective date:** 16 November 2026

Personal OS is a local-first personal dashboard. Everything you create is
stored on your device first. Cloud sync, the AI assistant and health insights
are optional features you turn on yourself. This policy explains exactly what
each one handles.

## Google account and cloud sync

Signing in with Google is optional. If you sign in, Personal OS uses Firebase
Authentication to confirm your identity and stores your data in Cloud
Firestore under a document tree keyed by your Firebase user id
(`users/{uid}`). Only you can read or write that tree; the security rules
reject every other account.

What sync stores when you are signed in:

- Blocks (your timetable), tasks, deadlines and notes, including their
  title, body, dates and completion state.
- Your profile, home layout, app preferences and daily stats.
- A device identifier and `createdAt`/`updatedAt` timestamps used to resolve
  conflicts between devices.
- Deleted records are kept as small tombstones until they expire, so a
  deletion on one device is not undone by another.

Sync is last-write-wins. Google receives the data as our hosting and database
provider; it is not used for advertising, profiling or any purpose other than
storing your account data. Personal OS does not run analytics or tracking
SDKs.

## Gmail and Google Classroom integrations

Gmail and Classroom are optional, separate from Google sign-in, and off by
default. Enabling one asks Google only for the scopes it needs:
`gmail.readonly`; `classroom.courses.readonly`;
`classroom.coursework.me.readonly`; `classroom.announcements.readonly`; and
`classroom.student-submissions.me.readonly`. The app never sends, marks,
archives or deletes mail, and cannot submit coursework. Gmail is read-only;
Classroom submission opens the assignment in Google Classroom instead.

- Fetched messages, subjects, snippets, courses, coursework, submission state
  and announcements are cached **only on this device**. They are never written
  to Firestore, never synced to another device, and are not part of a backup
  unless you turn on **Include integration data in backups**.
- OAuth access and refresh tokens are kept in the device's protected store
  (Keychain on macOS, Keystore-backed storage on Android), never in the app
  state, Firestore or a backup. Disconnecting calls Google's revoke endpoint and
  deletes that integration's local cache.
- If you turn on **Let AI read integration data** (off by default), only the
  sender, subject and snippet of selected emails are sent to your AI provider.
  Full email bodies are never sent. The app shows the exact payload before you
  send it.
- Apps in Google's Testing publishing status issue refresh tokens that expire
  after **7 days**. When that happens the token is cleared, cached data stays
readable, and the app asks you to reconnect. There is no retry loop.

## AI assistant

The assistant is off until you add your own API key. When you send a message,
the text you type, the conversation so far and the app data the assistant is
allowed to read are sent to Google's Gemini API to generate a reply.

- Note text is included **only** when you turn on "Read your notes". It is off
  by default.
- Notes marked private are **never** sent to the AI, even when note access is
  on.
- Your API key is stored in the device's secure storage (Keychain on macOS,
  Keystore-backed storage on Android, the browser's local storage on the web).
  It is never written to Firebase or included in settings backups.
- Requests go directly from your device to Google under your own API key and
  Google's terms.

## Health Connect (Android)

With your permission, Personal OS reads only steps, sleep sessions and active
calories burned from Health Connect.

- Access is read-only. The app never writes health data.
- Health data is processed on your device to show the Health section of
  Insights. It is never stored by the app, never synced to Firebase, never
  shared and never sold.
- You can revoke access at any time in the Health Connect app. Because the app
  keeps no copy, there is no separate health-data record to delete.

## Optional crash reports

Crash reporting is off by default. If you turn on **Settings → Privacy → Send
anonymous crash reports**, the app sends exactly this to the configured crash
collector:

- the error name, message and stack trace, with emails, tokens, query strings
  and long identifiers replaced by `[email]`, `[redacted]`;
- the app version;
- the platform (`web`, `macOS` or `Android`).

Nothing else is sent: no notes, task or deadline titles, profile name, email,
API keys, device identifiers, free-form text or screenshots. There is no
third-party analytics SDK. **Copy diagnostics** copies the same redacted JSON
to your clipboard without any network request. If the build has no collector
configured (`VITE_CRASH_REPORT_ENDPOINT`), enabling the toggle sends nothing.

## What we never do

- No selling or renting of your data.
- No advertising or marketing use.
- No third-party analytics, advertising or tracking SDKs.
- No server of our own: the app talks to Firebase and, if you enable it, the
  AI provider you chose.

## Retention and deletion

Local data stays until you clear it. In Settings → Data:

- **Clear data on this device** removes the local copy only. If you are signed
  in, the cloud copy returns on the next sync.
- **Delete my cloud data** permanently deletes every document under
  `users/{uid}` in Firestore, then clears this device and signs you out.

You can also delete your Firebase account and its data from the Firebase
console. Backups you exported are plain JSON files under your control; delete
them like any other file.

## Children

Personal OS is not directed at children under 13 and does not knowingly collect
their data.

## Changes

Material changes to this policy will be published on this page with a new
effective date.

## Contact

Questions or deletion requests: {EMAIL}

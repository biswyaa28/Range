# Android Today widget and share target

Both features are local-only. The widget reads a JSON snapshot from
`SharedPreferences` (`personalos_widget/snapshot`); nothing is sent to a
server and no extra Android permission is required.

## Manual test steps

1. Install the debug or release APK on Android 10+ and open Personal OS once.
2. Long-press the home screen → Widgets → Personal OS → Today. Place the widget.
3. Add a timetable block starting later today and a task due today; the widget
   shows up to three upcoming blocks and three due tasks after the next state
   change (or within 30 minutes).
4. In any app, share a text snippet to Personal OS. The app opens Tasks with a
   new task whose title uses the shared text (dates and priorities are parsed
   by quick add).
5. Reboot the phone and confirm the widget still renders the last local
   snapshot. A cold start refreshes it from the current store.

## Mac shortcut

`Cmd+Shift+Space` is intentionally not wired. This build does not include
`tauri-plugin-global-shortcut`; adding it would require a new desktop
capability and permission surface. The existing in-app shortcut remains the
palette/search entry point.

# Two-device sync checklist (Mac ↔ Android)

Prerequisites: both builds signed in to the **same** Google account, a network
on both, and the Mac sync status showing *Synced* in Settings.

Auto-sync debounces for 15 seconds after an edit and runs on app start, on
reconnect, and on **Sync now**.

1. **Basic round trip** — On the Mac create a task, a note and a timetable
   block. Within ~20s the Android Tasks, Notes and Plan screens show all three.
2. **Concurrent edit** — Take Android offline (airplane mode). Edit the same
   task title on both devices. Reconnect Android, press **Sync now**. Both
   devices show one title: the newer `updatedAt` wins; an exact tie resolves by
   device id, and both settle on the same value. No duplicate task.
3. **Delete wins** — Delete a note on the Mac. It disappears on Android and does
   not return after either device syncs again. Repeat with an offline edit
   racing the delete: only a strictly newer edit may revive the record.
4. **Sign out / sign in, same account** — Sign out on Android and back in. Data
   stays, and the task count does not double.
5. **Different account** — Sign out and sign in with a second Google account.
   Settings → Sync shows the new account, and the Firebase console for that uid
   must contain **none** of the first account's records. Local data stays on the
   device, but only edits made after switching are uploaded.
6. **Kill mid-sync** — Force-quit the Mac app while the status says *Syncing…*.
   Relaunch. Data is intact (no partial records) and sync returns to *Synced*.
7. **Airplane mode** — Turn off networking on either device, edit a task, and
   confirm the status shows *Offline* and changes persist across a reload.
   Reconnect: changes upload and the remote edits arrive.
8. **Spark quota** — Firebase console → Usage → Firestore. After the checks
   above, reads stay well under 50k/day and writes under 20k/day. Each sync pulls
   four collections plus two state documents; a full edit burst triggers one
   debounced sync, not one per keystroke.

Not automatable here: haptics, Android hardware back, and OS-level sign-in
sheets. Check those on a physical device.

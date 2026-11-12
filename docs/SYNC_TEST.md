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
   above, reads stay well under 50k/day and writes under 20k/day. An incremental
   sync reads only records newer than the cursor plus the three `state`
   documents; a full edit burst triggers one debounced sync, not one per
   keystroke.
9. **Large first sync** — On a fresh account, import a backup with more than
   1,300 tasks (or create records in a loop). The first sync commits several
   400-op batches. While it runs, force-quit the app. Relaunch: the batches that
   already committed are not sent again, the rest continue, and no record is
   duplicated. Settings shows *Synced* only after the last batch.
10. **History cap** — Import a backup with several years of day stats. After a
    sync, Settings → Sync shows *Older stats were trimmed to keep sync working*,
    the newest days are still present, and the remote `state/stats` document
    stays under 400 KB.
11. **Incremental pull** — With both devices synced, add one note on the Mac.
    Wait for the debounced sync, then sync Android. In the Firebase console the
    Android sync reads far fewer documents than the first one; the note still
    arrives. Wait 24 hours (or clear the cursor) and the next sync is a full one.
12. **Long offline (>60 days)** — Set the device clock/cursor back, delete a
    task on the other device, then sync the stale device. The deleted task must
    not come back; a task that was edited on the stale device after its last
    upload must be kept. See `docs/OPS.md` for the tombstone TTL policy.
13. **Clock skew** — Set one device's clock an hour ahead, edit a task there, and
    sync both. The other device clamps the stamp to its own `now`; further edits
    still win, and the two devices converge on one copy.
14. **Status copy** — In Settings the sync row reads *Last synced <relative
    time>*, turns into the failure message with a red style when a sync errors,
    and shows the trim notice when the stats cap fires.

Not automatable here: haptics, Android hardware back, and OS-level sign-in
sheets. Check those on a physical device.

Automated equivalents live in `tests/unit/syncPushChunking.test.ts` (S1),
`tests/unit/syncStatsCap.test.ts` (S2), `tests/unit/syncPullPlan.test.ts` (S3),
`tests/unit/mergeClockSkew.test.ts` (S4), `tests/unit/syncTombstones.test.ts`
(S5), `tests/unit/syncPayloadAllowlist.test.ts` plus `npm run test:rules` (S6),
and `tests/unit/settingsSyncStatus.test.tsx` (S7).

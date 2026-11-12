# Sync operations

Operational notes for the Firestore side of sync. All commands here are
documentation: run them only from a machine that is authenticated to the
Firebase project, and never from CI or an agent session.

Project: `range6969` (see `.firebaserc`).

## Deploying the security rules

```bash
firebase deploy --only firestore:rules
```

The rules are the only server-side guard on the data. The app additionally caps
document size before writing (`STATE_APP_MAX_BYTES` = 400 KB), because the
rules language cannot measure a document's byte size.

## Tombstone TTL

Soft deletes are written as records with `deleted: true` and an `expireAt`
Firestore `Timestamp` set to `updatedAt + 90 days`. A TTL policy per collection
lets Firestore remove the document after that instant.

Enable the policy for each record collection:

```bash
for group in blocks tasks notes deadlines; do
  gcloud firestore fields ttls update expireAt \
    --collection-group="$group" \
    --enable-ttl \
    --project=range6969
done
```

Check what is configured:

```bash
for group in blocks tasks notes deadlines; do
  gcloud firestore fields ttls list \
    --collection-group="$group" \
    --project=range6969
done
```

Disable it again (for example while debugging):

```bash
gcloud firestore fields ttls update expireAt \
  --collection-group=tasks \
  --disable-ttl \
  --project=range6969
```

Notes:

- TTL deletion is asynchronous and best effort; Firestore documents typically
  disappear within 24 hours of `expireAt`. The app never depends on the exact
  timing.
- Only tombstones carry `expireAt`. A live record has no expiry, so restoring a
  record is a normal write and is not racing the TTL.
- The client also garbage-collects its own synced tombstones once they are
  older than 90 days (`PersonalStore.gcExpiredTombstones`), so a device that
  keeps syncing does not accumulate them locally either.

## Offline devices and expired tombstones

A device that has been offline for more than 60 days plans a full pull
(`planPull` → `stale-cursor`). Because the remote may already have TTL-deleted
tombstones, the engine compares the pull against its push ledger:

- a record this device uploaded, still present locally, absent from the full
  pull, and not edited since the upload → tombstoned locally, not re-uploaded;
- a record edited locally after the upload → kept (last-write-wins), so local
  work is never lost;
- a record the remote never confirmed → untouched.

## Quota expectations (Spark)

- Push writes are chunked at 400 operations per batch (Firestore's hard limit
  is 500), and a failed chunk leaves the rest for the retry.
- An incremental pull reads only records with `updatedAt` newer than the local
  cursor minus a 10-minute overlap, plus the three `state` documents. A full
  pull runs on first sign-in, account change, cursor trouble, after 60 days
  offline, and once every 24 hours.
- Day stats are pruned to 730 days and the synced day map is capped at 400 KB,
  so a growing history cannot push a sync over the document limit.

## Local state the client keeps

`SyncStateStore` (in `src/store`, the only layer allowed to touch storage)
keeps, under its own key:

- the account uid the cursor belongs to,
- the pull cursor (`lastPullAt`, `lastFullPullAt`, schema version),
- the push ledger (collection/id → last confirmed `updatedAt`).

Clearing site data or the app's storage removes the cursor, which simply
causes the next sync to do a full pull. Remote data is unaffected.

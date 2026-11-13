# Sync Engine

## Purpose

Replicates local records and preferences to a remote store with last-write-wins
(LWW) conflict resolution, tombstones and replication cursors. The engine is
vendor-agnostic; Firebase is one adapter.

## Files

- `types.ts` — `SyncAdapter`, account, snapshot/push payloads and UI state.
- `engine.ts` — auth/online subscriptions, pull → merge → push, cursors, status.
- `batching.ts` — splits a push into ≤400-operation chunks under the 500-op
  Firestore batch limit.
- `pullPlan.ts` — decides between a full and an incremental pull.
- `reconcile.ts` — reconciles records the remote dropped and prunes the push ledger.
- `appPayload.ts` — builds `state/app`/`state/stats` payloads and caps the day map.
- `preferences.ts` — merges remote preferences by LWW; secrets are not part of `Settings`.
- `firebaseConfig.ts` — reads `VITE_FIREBASE_*`; missing values disable sync.
- `firebaseAdapter.ts` — lazy Firebase Auth + Firestore with offline cache.
- `useSync.ts` — React subscription to the singleton engine.
- `index.ts` — wires the adapter to the app stores.

## Flow

1. Capture local pending changes (`PersonalStore.pendingChanges()`).
2. Plan the pull: incremental `where('updatedAt', '>', since)` with a 10-minute
   overlap, or a full pull on first sign-in, account change, cursor schema
   change, more than 60 days offline, and once every 24 hours.
3. Pull the remote snapshot.
4. Merge records with `PersonalStore.mergeRemote()` and preferences with
   `mergePreferences()`.
5. Push only records that were local before the merge and are still at the same
   `updatedAt`; remote values are never echoed back. `planPushBatches` splits the
   payload into ≤400-op chunks and each committed chunk is recorded in the push
   ledger, so a retry skips what already landed.
6. `markSynced(syncStartedAt)` after the last chunk so edits made during the sync
   stay pending.

## State split

- `state/app` holds the singletons (profile, layout, legacy settings).
- `state/stats` holds the day map, capped at 400 KB and pruned to 730 days.
- `state/preferences` holds versioned settings and never the AI key.

## Rules

- Operates independently of specific cloud vendors.
- Interfaces with Store via explicit change sets (`pendingChanges`,
  `mergeRemote`, `markSynced`).
- The AI key lives only in platform secure storage and is never part of
  `Settings`, so it cannot be pushed. A stray key in a remote document is
  discarded during normalization.
- Offline is a status, not an error: network work is skipped and changes stay
  pending until reconnect.
- Deletes are soft tombstones (`deleted: true`) and follow the same LWW rules as
  edits. Pushed tombstones carry `expireAt` and are garbage-collected after 90 days.
- Firebase modules are loaded with dynamic `import()` so unconfigured builds and
  tests never load the SDK.

See `docs/FIREBASE_SYNC.md` for Spark setup and the Firestore layout.

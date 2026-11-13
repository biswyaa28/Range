/**
 * Tracks whether the last browser-storage write succeeded. Stores never throw at
 * callers, so this is the only way the UI can tell the user that their edits
 * exist in memory only.
 *
 * The snapshot object is replaced only when the failed/saved state flips, so it
 * is safe to read from `useSyncExternalStore`.
 */

export type PersistenceArea = 'state' | 'settings';

export interface PersistenceStatus {
  /** True while at least one area's most recent write failed. */
  failed: boolean;
}

const failures = new Set<PersistenceArea>();
const listeners = new Set<() => void>();

let snapshot: PersistenceStatus = { failed: false };

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A subscriber must never break persistence.
    }
  }
}

export function getPersistenceStatus(): PersistenceStatus {
  return snapshot;
}

export function subscribePersistenceStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportWriteFailure(area: PersistenceArea): void {
  const wasFailed = snapshot.failed;
  failures.add(area);
  if (wasFailed) return;
  snapshot = { failed: true };
  notify();
}

export function reportWriteSuccess(area: PersistenceArea): void {
  if (!failures.delete(area)) return;
  if (failures.size > 0) return;
  snapshot = { failed: false };
  notify();
}

/** Test helper: forget any recorded failure without touching storage. */
export function resetPersistenceStatus(): void {
  failures.clear();
  snapshot = { failed: false };
  notify();
}

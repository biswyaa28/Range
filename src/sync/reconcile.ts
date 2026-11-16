import type { BaseRecord } from '@/domain/types';
import type { PushLedger } from '@/store/syncState';
import { pushLedgerKey } from '@/store/syncState';

export type ReconcileCollection = 'blocks' | 'tasks' | 'notes' | 'deadlines' | 'habits';

export const RECONCILE_COLLECTIONS: readonly ReconcileCollection[] = [
  'blocks',
  'tasks',
  'notes',
  'deadlines',
  'habits',
];

export interface ReconcileInput {
  /** The local copy of every record, per collection. */
  local: Record<ReconcileCollection, BaseRecord[]>;
  /** The ids the remote still holds, per collection. */
  remoteIds: Record<ReconcileCollection, Set<string>>;
  /** The ids edited on this device since the last sync, per collection. */
  pendingIds: Record<ReconcileCollection, Set<string>>;
  /** The records the remote confirmed, keyed by `collection/id`. */
  ledger: PushLedger;
}

export interface ReconcileResult {
  /** Records the remote dropped and that must be tombstoned locally. */
  tombstones: Array<{ collection: ReconcileCollection; id: string }>;
  /** The ledger without entries for records that no longer exist locally. */
  ledger: PushLedger;
}

/**
 * Works out which local records the remote has dropped.
 *
 * A remote tombstone expires after the retention window, so a device that
 * was away for a long time reads a full pull that no longer mentions the
 * deleted record. Left alone, the next push would send that record back and
 * resurrect it.
 *
 * A record is only tombstoned when all of these hold:
 * - the remote confirmed it at some point, so its absence is meaningful;
 * - the full pull did not return it, so the remote really dropped it;
 * - it was not edited on this device, so no local work is lost.
 */
export function planMissingRemoteTombstones(input: ReconcileInput): ReconcileResult {
  const tombstones: Array<{ collection: ReconcileCollection; id: string }> = [];
  const ledger: PushLedger = {};

  for (const collection of RECONCILE_COLLECTIONS) {
    const local = input.local[collection] ?? [];
    const remoteIds = input.remoteIds[collection] ?? new Set<string>();
    const pendingIds = input.pendingIds[collection] ?? new Set<string>();

    for (const record of local) {
      const key = pushLedgerKey(collection, record.id);
      const confirmed = input.ledger[key];

      // Only records this device uploaded can be judged by their absence.
      if (confirmed === undefined) continue;

      ledger[key] = confirmed;

      if (record.deleted) continue;
      if (pendingIds.has(record.id)) continue;
      if (remoteIds.has(record.id)) continue;

      tombstones.push({ collection, id: record.id });
    }
  }

  return { tombstones, ledger };
}

/**
 * Keeps only the ledger entries for records that still exist locally.
 *
 * The ledger otherwise grows with every record the device has ever pushed,
 * including tombstones that were garbage-collected long ago.
 */
export function pruneLedger(
  ledger: PushLedger,
  local: Record<ReconcileCollection, BaseRecord[]>,
): PushLedger {
  const kept: PushLedger = {};
  for (const collection of RECONCILE_COLLECTIONS) {
    for (const record of local[collection] ?? []) {
      const key = pushLedgerKey(collection, record.id);
      const confirmed = ledger[key];
      if (confirmed !== undefined) kept[key] = confirmed;
    }
  }
  return kept;
}

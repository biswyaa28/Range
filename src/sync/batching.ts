import type { BaseRecord } from '@/domain/types';
import type { SyncPush } from './types';

export type CollectionName = 'blocks' | 'tasks' | 'notes' | 'deadlines';

/**
 * Firestore accepts 500 writes per batch. The app uses 400 so a batch keeps
 * headroom for the state documents and stays inside the offline cache's
 * per-transaction budget on low-end Android devices.
 */
export const MAX_BATCH_OPS = 400;

const COLLECTIONS: readonly CollectionName[] = ['blocks', 'tasks', 'notes', 'deadlines'];

export interface PushBatch extends SyncPush {
  /** Records carried by this batch, keyed by collection. */
  records: Record<CollectionName, BaseRecord[]>;
}

function emptyPush(): SyncPush {
  return {
    blocks: [],
    tasks: [],
    notes: [],
    deadlines: [],
    profile: null,
    layout: null,
    appSettings: null,
    dayStats: {},
    preferences: null,
  };
}

/** True when the payload writes the `state/app` document (the singletons). */
export function writesStateApp(payload: SyncPush): boolean {
  return Boolean(payload.profile || payload.layout || payload.appSettings);
}

/** True when the payload writes the `state/stats` document (the day map). */
export function writesDayStats(payload: SyncPush): boolean {
  return Object.keys(payload.dayStats).length > 0;
}

/** Number of Firestore writes a payload produces. */
export function countPushOps(payload: SyncPush): number {
  let ops =
    payload.blocks.length +
    payload.tasks.length +
    payload.notes.length +
    payload.deadlines.length;
  if (writesStateApp(payload)) ops += 1;
  if (writesDayStats(payload)) ops += 1;
  if (payload.preferences) ops += 1;
  return ops;
}

function toBatch(payload: SyncPush): PushBatch {
  return {
    ...payload,
    records: {
      blocks: payload.blocks,
      tasks: payload.tasks,
      notes: payload.notes,
      deadlines: payload.deadlines,
    },
  };
}

/**
 * Splits a push payload into sequential batches of at most `maxOps` writes.
 *
 * The state documents travel in the last batch: they are single atomic
 * documents, so splitting them across batches would publish a half-written
 * state. Records keep their collection order, so a retry pushes the same
 * chunks in the same order.
 */
export function planPushBatches(
  payload: SyncPush,
  maxOps: number = MAX_BATCH_OPS,
): PushBatch[] {
  const limit = Math.max(1, Math.floor(maxOps));
  const batches: PushBatch[] = [];
  let current = emptyPush();
  let currentOps = 0;

  const flush = (): void => {
    if (currentOps === 0) return;
    batches.push(toBatch(current));
    current = emptyPush();
    currentOps = 0;
  };

  for (const name of COLLECTIONS) {
    const list = payload[name];
    for (const record of list) {
      if (currentOps >= limit) flush();
      current[name] = [...current[name], record] as never;
      currentOps += 1;
    }
  }

  // State documents are written last so a partial failure never leaves the
  // remote state pointing at records that are not there yet.
  const stateOps =
    (writesStateApp(payload) ? 1 : 0) +
    (writesDayStats(payload) ? 1 : 0) +
    (payload.preferences ? 1 : 0);
  if (stateOps > 0) {
    if (currentOps + stateOps > limit) flush();
    current.profile = payload.profile;
    current.layout = payload.layout;
    current.appSettings = payload.appSettings;
    current.dayStats = payload.dayStats;
    current.preferences = payload.preferences;
    currentOps += stateOps;
  }

  flush();
  return batches;
}

/** Every record carried by a batch, in collection order. */
export function batchRecords(
  batch: PushBatch,
): Array<{ collection: CollectionName; id: string; updatedAt: string }> {
  const out: Array<{ collection: CollectionName; id: string; updatedAt: string }> = [];
  for (const collection of COLLECTIONS) {
    for (const record of batch.records[collection]) {
      out.push({ collection, id: record.id, updatedAt: String(record.updatedAt) });
    }
  }
  return out;
}

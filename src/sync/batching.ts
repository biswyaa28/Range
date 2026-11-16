import { RECORD_MAX_BYTES } from '@/domain/limits';
import type { BaseRecord } from '@/domain/types';
import type { SyncPush, UnsyncableRecord } from './types';

export type CollectionName = 'blocks' | 'tasks' | 'notes' | 'deadlines' | 'habits';

/**
 * Firestore accepts 500 writes per batch. The app uses 400 so a batch keeps
 * headroom for the state documents and stays inside the offline cache's
 * per-transaction budget on low-end Android devices.
 */
export const MAX_BATCH_OPS = 400;

const COLLECTIONS: readonly CollectionName[] = ['blocks', 'tasks', 'notes', 'deadlines', 'habits'];

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
    habits: [],
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
    payload.deadlines.length +
    payload.habits.length;
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
      habits: payload.habits,
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

export interface SizedPush {
  sendable: SyncPush;
  skipped: UnsyncableRecord[];
}

/** UTF-8 byte length of a record once serialized for Firestore. */
export function recordBytes(record: unknown): number {
  const json = JSON.stringify(record) ?? '';
  if (typeof TextEncoder === 'undefined') return json.length;
  return new TextEncoder().encode(json).length;
}

function recordTitle(record: unknown, id: string): string {
  if (record && typeof record === 'object') {
    const title = (record as Record<string, unknown>)['title'];
    if (typeof title === 'string' && title.trim()) return title;
  }
  return id;
}

/**
 * Removes records that exceed Firestore's practical document size.
 *
 * One oversized note would fail every batch that carries it forever, so it is
 * dropped from the payload and reported instead. Everything else still goes.
 */
export function splitPushBySize(
  payload: SyncPush,
  maxBytes: number = RECORD_MAX_BYTES,
): SizedPush {
  const skipped: UnsyncableRecord[] = [];

  const keep = <T extends BaseRecord>(collection: CollectionName, list: T[]): T[] =>
    list.filter((record) => {
      const bytes = recordBytes(record);
      if (bytes <= maxBytes) return true;
      skipped.push({ collection, id: record.id, title: recordTitle(record, record.id), bytes });
      return false;
    });

  return {
    sendable: {
      ...payload,
      blocks: keep('blocks', payload.blocks),
      tasks: keep('tasks', payload.tasks),
      notes: keep('notes', payload.notes),
      deadlines: keep('deadlines', payload.deadlines),
      habits: keep('habits', payload.habits),
    },
    skipped,
  };
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

import { describe, expect, it } from 'vitest';
import type { DayStats, Task } from '@/domain/types';
import {
  countPushOps,
  MAX_BATCH_OPS,
  planPushBatches,
  writesDayStats,
  writesStateApp,
} from '@/sync/batching';
import type { SyncPush } from '@/sync/types';

const TS = '2026-01-01T00:00:00.000Z';

function task(id: string): Task {
  return {
    id,
    title: id,
    due: null,
    priority: 'med',
    done: false,
    category: '',
    createdAt: TS,
    updatedAt: TS,
    deleted: false,
    deviceId: 'device-1',
  } as unknown as Task;
}

const DAY: DayStats = {
  date: '2026-01-01',
  blocksDone: 1,
  blocksTotal: 2,
  tasksDone: 3,
  focusMinutes: 25,
  updatedAt: TS,
};

function payload(patch: Partial<SyncPush> = {}): SyncPush {
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
    ...patch,
  };
}

describe('planPushBatches', () => {
  it('produces no batch for an empty payload', () => {
    expect(planPushBatches(payload())).toEqual([]);
    expect(countPushOps(payload())).toBe(0);
  });

  it('splits a payload that exceeds one Firestore batch', () => {
    const tasks = Array.from({ length: MAX_BATCH_OPS + 1 }, (_, index) => task(`t${index}`));
    const batches = planPushBatches(payload({ tasks }));

    expect(batches).toHaveLength(2);
    expect(batches[0]?.tasks).toHaveLength(MAX_BATCH_OPS);
    expect(batches[1]?.tasks).toHaveLength(1);
    for (const batch of batches) {
      expect(countPushOps(batch)).toBeLessThanOrEqual(MAX_BATCH_OPS);
    }
    expect(batches.flatMap((batch) => batch.tasks.map((entry) => entry.id))).toEqual(
      tasks.map((entry) => entry.id),
    );
  });

  it('keeps state documents in the last batch and never splits them', () => {
    const tasks = Array.from({ length: MAX_BATCH_OPS }, (_, index) => task(`t${index}`));
    const batches = planPushBatches(
      payload({
        tasks,
        profile: { name: 'Ada', updatedAt: TS } as SyncPush['profile'],
        preferences: { theme: 'dark', updatedAt: TS } as unknown as SyncPush['preferences'],
        dayStats: { '2026-01-01': DAY },
      }),
    );

    expect(batches).toHaveLength(2);
    const last = batches.at(-1);
    expect(last?.tasks).toHaveLength(0);
    expect(last?.profile).not.toBeNull();
    expect(last?.preferences).not.toBeNull();
    expect(writesDayStats(last as SyncPush)).toBe(true);
    expect(countPushOps(last as SyncPush)).toBeLessThanOrEqual(MAX_BATCH_OPS);
  });
});

describe('state document planning', () => {
  it('counts day stats and singletons as separate writes', () => {
    const withStats = payload({
      dayStats: { '2026-01-01': DAY },
      layout: { updatedAt: TS } as SyncPush['layout'],
    });

    expect(writesStateApp(withStats)).toBe(true);
    expect(writesDayStats(withStats)).toBe(true);
    expect(countPushOps(withStats)).toBe(2);
  });

  it('does not treat day stats as a state/app write', () => {
    const onlyStats = payload({ dayStats: { '2026-01-01': DAY } });

    expect(writesStateApp(onlyStats)).toBe(false);
    expect(countPushOps(onlyStats)).toBe(1);
  });
});

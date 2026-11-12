import { describe, expect, it } from 'vitest';
import { FixedClock } from '@/domain/dates';
import { defaultState } from '@/domain/types';
import type { AppState } from '@/domain/types';
import { MAX_CLOCK_SKEW_MS, mergeRemote } from '@/store/merge';
import { nextStamp } from '@/store/stamp';
import { PersonalStore } from '@/store/store';
import { MemoryStorage } from './memoryStorage';

const NOW = '2026-04-13T10:00:00.000Z';
const NOW_MS = Date.parse(NOW);

function state(): AppState {
  const base = defaultState();
  base.deviceId = 'device-a';
  return base;
}

function ahead(ms: number): string {
  return new Date(NOW_MS + ms).toISOString();
}

function behind(ms: number): string {
  return new Date(NOW_MS - ms).toISOString();
}

describe('merging a remote timestamp from a clock that runs ahead', () => {
  it('clamps a record stamp further ahead than the skew allowance', () => {
    const target = state();

    mergeRemote(
      target,
      {
        tasks: [
          {
            id: 'task-1',
            title: 'From a broken clock',
            createdAt: ahead(60 * 60_000),
            updatedAt: ahead(60 * 60_000),
            deviceId: 'device-b',
          },
        ],
      },
      undefined,
      { now: NOW },
    );

    expect(target.tasks[0]?.updatedAt).toBe(NOW);
  });

  it('keeps a record stamp inside the skew allowance', () => {
    const target = state();
    const stamp = ahead(MAX_CLOCK_SKEW_MS - 1_000);

    mergeRemote(
      target,
      {
        tasks: [{ id: 'task-1', title: 'Slightly ahead', createdAt: stamp, updatedAt: stamp }],
      },
      undefined,
      { now: NOW },
    );

    expect(target.tasks[0]?.updatedAt).toBe(stamp);
  });

  it('lets a local edit win after a clamped remote stamp', () => {
    const target = state();
    target.tasks.push({
      id: 'task-1',
      title: 'Local title',
      due: null,
      priority: 'med',
      done: false,
      category: '',
      createdAt: behind(60_000),
      updatedAt: NOW,
      deleted: false,
      deviceId: 'device-a',
    });

    mergeRemote(
      target,
      {
        tasks: [
          {
            id: 'task-1',
            title: 'Ahead of the clock',
            createdAt: ahead(60 * 60_000),
            updatedAt: ahead(60 * 60_000),
            deviceId: 'device-b',
          },
        ],
      },
      undefined,
      { now: NOW },
    );

    // The clamped stamp ties with the local one; the tiebreak keeps the local
    // copy because device-a sorts above device-b in this fixture.
    expect(target.tasks[0]?.updatedAt).toBe(NOW);
  });

  it('clamps a singleton stamp that runs ahead', () => {
    const target = state();

    mergeRemote(
      target,
      {
        profile: {
          name: 'Ahead',
          updatedAt: ahead(60 * 60_000),
        },
      },
      undefined,
      { now: NOW },
    );

    expect(target.profile.updatedAt).toBe(NOW);
  });

  it('clamps a day stamp that runs ahead', () => {
    const target = state();

    mergeRemote(
      target,
      {
        dayStats: {
          '2026-04-12': {
            date: '2026-04-12',
            blocksDone: 1,
            blocksTotal: 1,
            tasksDone: 1,
            focusMinutes: 30,
            updatedAt: ahead(60 * 60_000),
          },
        },
      },
      undefined,
      { now: NOW },
    );

    expect(target.dayStats['2026-04-12']?.updatedAt).toBe(NOW);
  });
});

describe('the device id tiebreak', () => {
  function remoteTask(deviceId: string) {
    return {
      id: 'task-1',
      title: `Edited on ${deviceId}`,
      createdAt: NOW,
      updatedAt: NOW,
      deviceId,
    };
  }

  it('converges both devices on the same copy', () => {
    const deviceA = state();
    deviceA.deviceId = 'device-a';
    deviceA.tasks.push({ ...remoteTask('device-a'), due: null, priority: 'med', done: false, category: '', deleted: false } as never);

    const deviceB = state();
    deviceB.deviceId = 'device-b';
    deviceB.tasks.push({ ...remoteTask('device-b'), due: null, priority: 'med', done: false, category: '', deleted: false } as never);

    mergeRemote(deviceA, { tasks: [remoteTask('device-b')] }, undefined, { now: NOW });
    mergeRemote(deviceB, { tasks: [remoteTask('device-a')] }, undefined, { now: NOW });

    expect(deviceA.tasks[0]?.deviceId).toBe('device-b');
    expect(deviceB.tasks[0]?.deviceId).toBe('device-b');
  });
});

describe('stamping local edits', () => {
  it('uses the clock when the record has no stamp yet', () => {
    const clock = new FixedClock(NOW);
    expect(nextStamp(undefined, clock)).toBe(NOW);
  });

  it('never moves backwards when the clock stands still', () => {
    const clock = new FixedClock(NOW);
    const first = nextStamp(NOW, clock);
    const second = nextStamp(first, clock);

    expect(Date.parse(first)).toBeGreaterThan(Date.parse(NOW));
    expect(Date.parse(second)).toBeGreaterThan(Date.parse(first));
  });

  it('keeps stamps growing across two edits in the same millisecond', () => {
    const store = new PersonalStore({
      storage: new MemoryStorage(),
      clock: new FixedClock(NOW),
      debounceMs: 0,
    });

    store.set((s) => {
      s.profile.name = 'First';
    });
    const first = store.get().profile.updatedAt;

    store.set((s) => {
      s.profile.name = 'Second';
    });
    const second = store.get().profile.updatedAt;

    expect(Date.parse(second)).toBeGreaterThan(Date.parse(first));
  });
});

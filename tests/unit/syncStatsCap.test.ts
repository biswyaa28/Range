import { describe, expect, it } from 'vitest';
import { addDays, FixedClock } from '@/domain/dates';
import type { DayStats } from '@/domain/types';
import { PersonalStore } from '@/store/store';
import { SettingsStore } from '@/store/settingsStore';
import { SyncEngine } from '@/sync/engine';
import { capDayStats, dayStatsBytes, STATE_APP_MAX_BYTES } from '@/sync/appPayload';
import type {
  RemoteSnapshot,
  SyncAccount,
  SyncAdapter,
  SyncPush,
  SyncPushOptions,
} from '@/sync/types';
import { MemoryStorage } from './memoryStorage';

const ACCOUNT: SyncAccount = {
  uid: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada',
  photoURL: null,
};

/** A day map of `count` synthetic days, oldest first. */
function syntheticDays(
  count: number,
  updatedAt = '2026-04-13T10:00:00.000Z',
  extraBytes = 0,
): Record<string, DayStats> {
  const days: Record<string, DayStats> = {};
  const start = '2024-04-13';
  for (let index = 0; index < count; index += 1) {
    const date = addDays(start, index);
    days[date] = {
      date,
      blocksDone: index,
      blocksTotal: index + 1,
      tasksDone: index,
      focusMinutes: index % 120,
      updatedAt,
      ...(extraBytes > 0 ? { note: 'x'.repeat(extraBytes) } : {}),
    } as DayStats;
  }
  return days;
}

class RecordingAdapter implements SyncAdapter {
  readonly kind = 'test';
  pushes: SyncPush[] = [];
  private listeners = new Set<(account: SyncAccount | null) => void>();

  subscribeAuth(listener: (account: SyncAccount | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  signInWithGoogle(): Promise<void> {
    return Promise.resolve();
  }

  signOut(): Promise<void> {
    return Promise.resolve();
  }

  emit(account: SyncAccount | null): void {
    for (const listener of this.listeners) listener(account);
  }

  async pull(): Promise<RemoteSnapshot> {
    return {
      blocks: [],
      tasks: [],
      notes: [],
      deadlines: [],
      profile: null,
      layout: null,
      appSettings: null,
      dayStats: null,
      preferences: null,
    };
  }

  async push(
    _account: SyncAccount,
    changes: SyncPush,
    options: SyncPushOptions = {},
  ): Promise<void> {
    this.pushes.push(changes);
    options.onChunkCommitted?.(changes);
  }
}

function setup() {
  const clock = new FixedClock('2026-04-13T10:00:00.000Z');
  const store = new PersonalStore({
    storage: new MemoryStorage(),
    clock,
    debounceMs: 0,
  });
  const settings = new SettingsStore({
    storage: new MemoryStorage(),
    clock,
    legacyKey: null,
    debounceMs: 0,
  });
  const adapter = new RecordingAdapter();
  const engine = new SyncEngine({
    adapter,
    store,
    settings,
    storage: new MemoryStorage(),
    clock,
    isOnline: () => true,
    onlineSubscription: () => () => undefined,
    autoSyncMs: null,
  });

  return { clock, store, settings, adapter, engine };
}

describe('the synced day map', () => {
  it('trims 6000 synthetic days under the byte cap', () => {
    const days = syntheticDays(6000);
    expect(dayStatsBytes(days)).toBeGreaterThan(STATE_APP_MAX_BYTES);

    const capped = capDayStats(days);

    expect(dayStatsBytes(capped.dayStats)).toBeLessThanOrEqual(STATE_APP_MAX_BYTES);
    expect(capped.droppedDays).toBeGreaterThan(0);
  });

  it('drops the oldest days and keeps the newest', () => {
    const capped = capDayStats(syntheticDays(6000));

    expect(capped.dayStats['2024-04-13']).toBeUndefined();
    expect(capped.dayStats[addDays('2024-04-13', 5999)]).toBeDefined();
  });

  it('leaves a day map that already fits alone', () => {
    const days = syntheticDays(10);

    const capped = capDayStats(days);

    expect(capped.droppedDays).toBe(0);
    expect(Object.keys(capped.dayStats)).toHaveLength(10);
  });

  it('drops days older than the retention span without a notice', async () => {
    const { store, adapter, engine, clock } = setup();

    engine.start();
    adapter.emit(ACCOUNT);
    await engine.syncNow();

    // Few enough days that the local count guard does not run, so the push is
    // the step that has to apply the retention span.
    clock.advanceMs(60_000);
    store.set((state) => {
      state.dayStats = {
        ...syntheticDays(5, clock.nowISO()),
        ...Object.fromEntries(
          Array.from({ length: 5 }, (_, index) => {
            const date = addDays('2020-01-01', index);
            return [
              date,
              {
                date,
                blocksDone: 1,
                blocksTotal: 1,
                tasksDone: 1,
                focusMinutes: 10,
                updatedAt: clock.nowISO(),
              } as DayStats,
            ];
          }),
        ),
      };
    });

    await engine.syncNow();

    const pushed = adapter.pushes.at(-1)?.dayStats ?? {};
    expect(Object.keys(pushed).some((date) => date < '2021-01-01')).toBe(false);
    expect(Object.keys(pushed)).toHaveLength(5);
    // The documented retention window is not a surprise the user needs a
    // notice for.
    expect(engine.getState().notice).toBeFalsy();
    engine.dispose();
  });

  it('tells the user when older stats were trimmed', async () => {
    const { store, adapter, engine, clock } = setup();

    engine.start();
    adapter.emit(ACCOUNT);
    await engine.syncNow();

    // A day map that is too large for the cap even after the age rule.
    clock.advanceMs(60_000);
    store.set((state) => {
      state.dayStats = syntheticDays(800, clock.nowISO(), 600);
    });

    await engine.syncNow();

    expect(engine.getState().notice).toBe('Older stats were trimmed to keep sync working');
    const pushed = adapter.pushes.at(-1);
    expect(dayStatsBytes(pushed?.dayStats ?? {})).toBeLessThanOrEqual(STATE_APP_MAX_BYTES);
    engine.dispose();
  });
});

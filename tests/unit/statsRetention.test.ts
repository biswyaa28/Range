import { describe, expect, it } from 'vitest';
import { addDays, FixedClock, todayISO } from '@/domain/dates';
import {
  oldestDayKey,
  pruneDayStatsByAge,
  STATS_RETENTION_DAYS,
  statsCutoffISO,
} from '@/domain/statsRetention';
import type { DayStats } from '@/domain/types';
import { PersonalStore } from '@/store/store';
import { MemoryStorage } from './memoryStorage';

const TODAY = '2026-11-12';

function day(iso: string): DayStats {
  return {
    date: iso,
    blocksDone: 1,
    blocksTotal: 1,
    tasksDone: 1,
    focusMinutes: 30,
    updatedAt: `${iso}T10:00:00.000Z`,
  };
}

describe('pruneDayStatsByAge', () => {
  it('drops days older than the cutoff and keeps the rest', () => {
    const { dayStats, removed } = pruneDayStatsByAge(
      {
        '2024-01-01': day('2024-01-01'),
        '2026-11-10': day('2026-11-10'),
        '2026-11-12': day('2026-11-12'),
      },
      '2026-01-01',
    );

    expect(removed).toBe(1);
    expect(Object.keys(dayStats)).toEqual(['2026-11-10', '2026-11-12']);
  });

  it('keeps the day exactly on the cutoff', () => {
    const cutoff = statsCutoffISO(TODAY);
    const { dayStats, removed } = pruneDayStatsByAge(
      { [cutoff]: day(cutoff), [addDays(cutoff, -1)]: day(addDays(cutoff, -1)) },
      cutoff,
    );

    expect(removed).toBe(1);
    expect(Object.keys(dayStats)).toEqual([cutoff]);
  });

  it('reports the oldest remaining day', () => {
    expect(oldestDayKey({})).toBeNull();
    expect(
      oldestDayKey({ '2026-11-12': day('2026-11-12'), '2026-01-02': day('2026-01-02') }),
    ).toBe('2026-01-02');
  });
});

describe('store day stats retention', () => {
  it('bounds the synced day map to the retention window', () => {
    const clock = new FixedClock(`${TODAY}T10:00:00.000Z`);
    const store = new PersonalStore({
      storage: new MemoryStorage(),
      clock,
      debounceMs: 0,
    });
    const today = todayISO(clock);

    store.set((state) => {
      for (let age = 0; age <= STATS_RETENTION_DAYS + 70; age += 1) {
        const iso = addDays(today, -age);
        state.dayStats[iso] = day(iso);
      }
    });

    const kept = Object.keys(store.get().dayStats);
    expect(kept.length).toBe(STATS_RETENTION_DAYS + 1);
    expect(kept.sort()[0]).toBe(statsCutoffISO(today));
  });
});

import { describe, it, expect } from 'vitest';
import {
  currentStreak,
  recomputeDayStats,
  weeklyActivity,
} from '@/domain/stats';
import { FixedClock } from '@/domain/dates';
import type { Block, DayStats } from '@/domain/types';

describe('domain stats & streaks', () => {
  const clock = new FixedClock('2026-04-13T10:00:00.000Z'); // Monday 2026-04-13

  it('calculates current streak with >= 80% completion rule', () => {
    const dayStats: Record<string, DayStats> = {
      // Today (2026-04-13): in progress, 1/2 (50%) -> should NOT break streak
      '2026-04-13': {
        date: '2026-04-13',
        blocksTotal: 2,
        blocksDone: 1,
        tasksDone: 0,
        focusMinutes: 25,
        updatedAt: '2026-04-13T10:00:00.000Z',
      },
      // Yesterday (2026-04-12): 4/5 (80%) -> streak continues
      '2026-04-12': {
        date: '2026-04-12',
        blocksTotal: 5,
        blocksDone: 4,
        tasksDone: 2,
        focusMinutes: 60,
        updatedAt: '2026-04-12T20:00:00.000Z',
      },
      // Day -2 (2026-04-11): 5/5 (100%) -> streak continues
      '2026-04-11': {
        date: '2026-04-11',
        blocksTotal: 5,
        blocksDone: 5,
        tasksDone: 3,
        focusMinutes: 90,
        updatedAt: '2026-04-11T20:00:00.000Z',
      },
      // Day -3 (2026-04-10): 3/5 (60%) -> breaks streak!
      '2026-04-10': {
        date: '2026-04-10',
        blocksTotal: 5,
        blocksDone: 3,
        tasksDone: 1,
        focusMinutes: 30,
        updatedAt: '2026-04-10T20:00:00.000Z',
      },
    };

    const streak = currentStreak(dayStats, clock);
    expect(streak).toBe(2);
  });

  it('recomputes dayStats counts accurately from blocks', () => {
    const blocks: Block[] = [
      {
        id: 'b1',
        title: 'Morning Block',
        day: 0,
        start: '09:00',
        end: '10:00',
        category: 'class',
        done: false,
        doneDates: ['2026-04-13'],
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        deleted: false,
        deviceId: 'dev1',
      },
      {
        id: 'b2',
        title: 'Evening Block',
        day: 0,
        start: '18:00',
        end: '19:00',
        category: 'study',
        done: false,
        doneDates: [],
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        deleted: false,
        deviceId: 'dev1',
      },
    ];

    const dayStats: Record<string, DayStats> = {};
    const updated = recomputeDayStats(dayStats, blocks, '2026-04-13', '2026-04-13T10:00:00.000Z');

    expect(updated.blocksTotal).toBe(2);
    expect(updated.blocksDone).toBe(1);
    expect(dayStats['2026-04-13']?.blocksTotal).toBe(2);
  });

  it('generates weeklyActivity array for Mon-Sun', () => {
    const dayStats: Record<string, DayStats> = {
      '2026-04-13': {
        date: '2026-04-13',
        blocksTotal: 3,
        blocksDone: 3,
        tasksDone: 1,
        focusMinutes: 45,
        updatedAt: '2026-04-13T10:00:00.000Z',
      },
    };

    const week = weeklyActivity(dayStats, clock);
    expect(week.length).toBe(7);
    expect(week[0]?.iso).toBe('2026-04-13');
    expect(week[0]?.isToday).toBe(true);
    expect(week[0]?.blocksDone).toBe(3);
    expect(week[6]?.iso).toBe('2026-04-19'); // Sunday
    expect(week[6]?.isToday).toBe(false);
  });
});

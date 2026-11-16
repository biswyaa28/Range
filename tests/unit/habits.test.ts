import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/domain/settings';
import {
  currentStreak,
  habitDone,
  habitIsScheduled,
  habitWeek,
  longestStreak,
  toggleHabitCheckin,
} from '@/domain/habits';
import { planNotifications } from '@/domain/notifications';
import type { Habit } from '@/domain/types';

const BASE = {
  id: 'habit-1',
  title: 'Read',
  schedule: 'daily' as const,
  checkins: [] as string[],
  reminder: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deleted: false,
  deviceId: 'device-1',
};

function habit(patch: Partial<Habit> = {}): Habit {
  return { ...BASE, ...patch };
}

describe('habit schedules and streaks', () => {
  it('gives today a grace day before breaking a daily streak', () => {
    const value = habit({ checkins: ['2026-11-13', '2026-11-14', '2026-11-15'] });
    expect(currentStreak(value, '2026-11-16')).toBe(3);
    expect(currentStreak(habit({ ...value, checkins: [...value.checkins, '2026-11-16'] }), '2026-11-16')).toBe(4);
  });

  it('skips weekends for weekday habits', () => {
    const value = habit({
      schedule: 'weekdays',
      checkins: ['2026-11-11', '2026-11-12', '2026-11-13'],
    });
    expect(habitIsScheduled(value, '2026-11-14')).toBe(false);
    expect(currentStreak(value, '2026-11-16')).toBe(3);
    expect(currentStreak({ ...value, checkins: [...value.checkins, '2026-11-16'] }, '2026-11-16')).toBe(4);
  });

  it('reports the longest run separately from the current streak', () => {
    const value = habit({
      schedule: 'weekdays',
      checkins: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09'],
    });
    expect(longestStreak(value)).toBe(6);
    expect(currentStreak(value, '2026-11-16')).toBe(0);
  });

  it('toggles one ISO date without duplicating it', () => {
    const once = toggleHabitCheckin(habit(), '2026-11-16');
    expect(once).toEqual(['2026-11-16']);
    expect(toggleHabitCheckin(habit({ checkins: once }), '2026-11-16')).toEqual([]);
  });

  it('builds weekly cells honoring Sunday or Monday week starts', () => {
    const value = habit({ checkins: ['2026-11-15'] });
    const sunday = habitWeek(value, '2026-11-16', 0);
    const monday = habitWeek(value, '2026-11-16', 1);
    expect(sunday[0]?.iso).toBe('2026-11-15');
    expect(sunday[0]?.done).toBe(true);
    expect(monday[0]?.iso).toBe('2026-11-16');
    expect(habitDone(value, '2026-11-15')).toBe(true);
  });
});

describe('habit reminders', () => {
  it('plans a reminder only on scheduled, unchecked days', () => {
    const settings = defaultSettings().notifications;
    settings.focus = false;
    settings.tasks = false;
    settings.deadlines = false;
    settings.weeklyDigest = false;
    const now = new Date('2026-11-16T10:00:00');
    const value = habit({ reminder: '20:00' });

    const planned = planNotifications({ blocks: [], tasks: [], deadlines: [], habits: [value], settings, now });
    expect(planned).toHaveLength(14);
    expect(planned[0]?.title).toBe('Habit reminder');
    expect(planned[0]?.body).toBe('Read');
    expect(new Date(planned[0]?.at ?? 0).getHours()).toBe(20);

    const done = { ...value, checkins: ['2026-11-16'] };
    const remaining = planNotifications({
      blocks: [],
      tasks: [],
      deadlines: [],
      habits: [done],
      settings,
      now,
    });
    expect(remaining.some((item) => new Date(item.at).getDate() === 16)).toBe(false);
  });
});

import { addDays, fromISO, weekDayIsos } from './dates';
import type { Habit } from './types';

/** Monday-Friday. Daily includes every calendar day. */
export function habitIsScheduled(habit: Pick<Habit, 'schedule'>, iso: string): boolean {
  if (habit.schedule === 'daily') return true;
  const day = fromISO(iso).getDay();
  return day >= 1 && day <= 5;
}

export function habitDone(habit: Pick<Habit, 'checkins'>, iso: string): boolean {
  return habit.checkins.includes(iso);
}

export function toggleHabitCheckin(habit: Habit, iso: string): string[] {
  const checkins = new Set(habit.checkins);
  if (checkins.has(iso)) checkins.delete(iso);
  else checkins.add(iso);
  return [...checkins].sort();
}

/**
 * Consecutive scheduled days completed. Today is a grace day: if it is
 * scheduled but not checked yet, the streak still counts back from yesterday.
 * Unscheduled weekend days are skipped for weekday habits.
 */
export function currentStreak(habit: Habit, todayIso: string): number {
  let cursor = todayIso;
  if (habitIsScheduled(habit, cursor) && !habitDone(habit, cursor)) {
    cursor = addDays(cursor, -1);
  }
  let streak = 0;
  for (let guard = 0; guard < 4000; guard += 1) {
    if (habitIsScheduled(habit, cursor)) {
      if (!habitDone(habit, cursor)) break;
      streak += 1;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Longest run of completed scheduled days in the habit's history. */
export function longestStreak(habit: Habit): number {
  if (habit.checkins.length === 0) return 0;
  const sorted = [...new Set(habit.checkins)].sort();
  const first = sorted[0] ?? '';
  const last = sorted[sorted.length - 1] ?? '';
  const done = new Set(sorted);
  let best = 0;
  let run = 0;
  let cursor = first;
  for (let guard = 0; guard < 20_000; guard += 1) {
    if (habitIsScheduled(habit, cursor)) {
      if (done.has(cursor)) {
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    if (cursor === last) break;
    cursor = addDays(cursor, 1);
  }
  return best;
}

export interface HabitHeatCell {
  iso: string;
  scheduled: boolean;
  done: boolean;
}

/** Seven cells for the week containing `todayIso`, honoring `weekStart`. */
export function habitWeek(
  habit: Habit,
  todayIso: string,
  weekStart: 0 | 1 | 6 = 1,
): HabitHeatCell[] {
  return weekDayIsos(todayIso, weekStart).map((iso) => ({
    iso,
    scheduled: habitIsScheduled(habit, iso),
    done: habitDone(habit, iso),
  }));
}

export function habitScheduleLabel(habit: Pick<Habit, 'schedule'>): string {
  return habit.schedule === 'weekdays' ? 'Weekdays' : 'Every day';
}

import type { Block, DayStats } from './types';
import { todayISO, addDays, mondayIndex, DAY_SHORT, defaultClock, Clock } from './dates';
import { blocksForDate, blockDoneOn } from './recurrence';

/**
 * Computes block completion count for a single date.
 */
export function computeBlockCounts(blocks: Block[], iso: string): { total: number; done: number } {
  const bs = blocksForDate(blocks, iso);
  return {
    total: bs.length,
    done: bs.filter((b) => blockDoneOn(b, iso)).length,
  };
}

/**
 * Ensures a DayStats record exists with default zeroes if not present.
 */
export function ensureDayStats(
  dayStats: Record<string, DayStats>,
  iso: string,
  nowISO: string = new Date().toISOString(),
): DayStats {
  const existing = dayStats[iso];
  if (existing) return existing;
  const created: DayStats = {
    date: iso,
    blocksDone: 0,
    blocksTotal: 0,
    tasksDone: 0,
    focusMinutes: 0,
    updatedAt: nowISO,
  };
  dayStats[iso] = created;
  return created;
}

/**
 * Recomputes blocksTotal and blocksDone on dayStats[iso].
 */
export function recomputeDayStats(
  dayStats: Record<string, DayStats>,
  blocks: Block[],
  iso: string,
  nowISO: string = new Date().toISOString(),
): DayStats {
  const s = ensureDayStats(dayStats, iso, nowISO);
  const counts = computeBlockCounts(blocks, iso);
  s.blocksTotal = counts.total;
  s.blocksDone = counts.done;
  s.updatedAt = nowISO;
  return s;
}

/**
 * Calculates current streak in days.
 * An active streak is formed by days with >= 80% completion rate (blocksDone / blocksTotal >= 0.8).
 * An incomplete or in-progress today never breaks an existing streak.
 * Iterates back up to 400 days.
 */
export function currentStreak(
  dayStats: Record<string, DayStats>,
  clock: Clock = defaultClock,
): number {
  let streak = 0;
  const today = todayISO(clock);
  let iso = today;

  for (let i = 0; i < 400; i++) {
    const s = dayStats[iso];
    if (s && s.blocksTotal > 0) {
      if (s.blocksDone / s.blocksTotal >= 0.8) {
        streak++;
      } else if (iso !== today) {
        // An in-progress today does not break the streak, but any earlier day < 80% breaks it
        break;
      }
    } else if (iso !== today) {
      // Days without scheduled blocks or missing stats
      // Legacy behavior: if s is undefined or blocksTotal == 0 on an earlier day, it breaks the streak!
      break;
    }
    iso = addDays(iso, -1);
  }

  return streak;
}

export interface DayActivity {
  iso: string;
  blocksDone: number;
  blocksTotal: number;
  dayLabel: string;
  isToday: boolean;
}

/**
 * Returns the 7 days of the current week (Mon-Sun) with activity counts.
 */
export function weeklyActivity(
  dayStats: Record<string, DayStats>,
  clock: Clock = defaultClock,
): DayActivity[] {
  const t = todayISO(clock);
  const currentMonIdx = mondayIndex(clock.now(), clock);
  const monday = addDays(t, -currentMonIdx);

  return DAY_SHORT.map((short, k) => {
    const iso = addDays(monday, k);
    const s = dayStats[iso];
    return {
      iso,
      blocksDone: s?.blocksDone ?? 0,
      blocksTotal: s?.blocksTotal ?? 0,
      dayLabel: short[0] + short.slice(1).toLowerCase(),
      isToday: iso === t,
    };
  });
}

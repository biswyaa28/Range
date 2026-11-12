import type { DayStats } from './types';
import { addDays } from './dates';

/**
 * How far back the screens read day stats. The streak card walks 400 days
 * back, which is the widest read of any surface.
 */
export const SCREEN_READ_RANGE_DAYS = 400;

/**
 * Retention floor for day stats. Two years keeps a full academic cycle of
 * history while bounding the size of the synced `state/stats` doc.
 */
export const MIN_STATS_RETENTION_DAYS = 730;

/** Days of day stats kept locally and remotely. */
export const STATS_RETENTION_DAYS = Math.max(
  SCREEN_READ_RANGE_DAYS,
  MIN_STATS_RETENTION_DAYS,
);

export interface PrunedDayStats {
  dayStats: Record<string, DayStats>;
  /** Days dropped by the age rule. */
  removed: number;
}

/**
 * Drops day stats older than the retention span. Days are keyed by an ISO
 * date, so a lexicographic comparison is a chronological one.
 */
export function pruneDayStatsByAge(
  dayStats: Record<string, DayStats>,
  cutoffISO: string,
): PrunedDayStats {
  const kept: Record<string, DayStats> = {};
  let removed = 0;
  for (const iso of Object.keys(dayStats)) {
    const stats = dayStats[iso];
    if (!stats) continue;
    if (iso < cutoffISO) {
      removed += 1;
      continue;
    }
    kept[iso] = stats;
  }
  return { dayStats: kept, removed };
}

/** The oldest day key still kept, or null when nothing is left. */
export function oldestDayKey(dayStats: Record<string, DayStats>): string | null {
  let oldest: string | null = null;
  for (const iso of Object.keys(dayStats)) {
    if (oldest === null || iso < oldest) oldest = iso;
  }
  return oldest;
}

/** Cutoff date for the retention span, given the current day. */
export function statsCutoffISO(todayISO: string, retentionDays = STATS_RETENTION_DAYS): string {
  return addDays(todayISO, -retentionDays);
}

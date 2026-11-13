import { Health } from '@capgo/capacitor-health';
import type { AuthorizationStatus, HealthDataType } from '@capgo/capacitor-health';
import { fromISO } from '@/domain/dates';
import type { HealthAccessState, HealthDataSummary, HealthProvider } from './types';

/**
 * Read-only Health Connect scopes. Never add write scopes here: the Android
 * manifest removes every WRITE_* permission, and the Insights UI only reads.
 */
const READ_TYPES: HealthDataType[] = ['steps', 'sleep', 'calories'];
const HOUR_MS = 3_600_000;

function hasReadAccess(status: AuthorizationStatus): boolean {
  return READ_TYPES.every((type) => status.readAuthorized.includes(type));
}

function localDayStart(dateISO: string): Date {
  const start = fromISO(dateISO);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfDay(dateISO: string, now: Date): Date {
  const next = localDayStart(dateISO);
  next.setDate(next.getDate() + 1);
  return now < next ? now : next;
}

/**
 * "Last night" spans noon yesterday to noon on the summary date, capped at the
 * current time so a partial night is not reported as complete.
 */
function sleepWindow(dateISO: string, now: Date): { start: Date; end: Date } {
  const start = localDayStart(dateISO);
  start.setDate(start.getDate() - 1);
  start.setHours(12, 0, 0, 0);

  const end = localDayStart(dateISO);
  end.setHours(12, 0, 0, 0);
  const cappedEnd = now < end ? now : end;

  return { start, end: cappedEnd > start ? cappedEnd : start };
}

/** Merge overlapping sessions so duplicate writers do not inflate sleep. */
function mergedDurationMs(intervals: Array<readonly [number, number]>): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const first = sorted[0];
  if (!first) return 0;

  let total = 0;
  let currentStart = first[0];
  let currentEnd = first[1];

  for (const [start, end] of sorted.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }

  return total + (currentEnd - currentStart);
}

export class HealthConnectProvider implements HealthProvider {
  async isAvailable(): Promise<boolean> {
    try {
      const result = await Health.isAvailable();
      return result.available;
    } catch {
      return false;
    }
  }

  async requestAccess(): Promise<HealthAccessState> {
    try {
      if (!(await this.isAvailable())) {
        return 'unavailable';
      }

      const current = await Health.checkAuthorization({ read: READ_TYPES });
      if (hasReadAccess(current)) {
        return 'granted';
      }

      const requested = await Health.requestAuthorization({ read: READ_TYPES });
      return hasReadAccess(requested) ? 'granted' : 'denied';
    } catch {
      return (await this.isAvailable()) ? 'denied' : 'unavailable';
    }
  }

  async getSummary(dateISO: string): Promise<HealthDataSummary | null> {
    const now = new Date();
    const start = localDayStart(dateISO);
    const end = endOfDay(dateISO, now);
    const hasDay = end.getTime() > start.getTime();

    const [stepsResult, caloriesResult, sleepResult] = await Promise.allSettled([
      hasDay ? this.sum('steps', start, end) : Promise.resolve(undefined),
      hasDay ? this.sum('calories', start, end) : Promise.resolve(undefined),
      this.sleepHours(dateISO, now),
    ]);

    const steps = stepsResult.status === 'fulfilled' ? stepsResult.value : undefined;
    const activeCalories =
      caloriesResult.status === 'fulfilled' ? caloriesResult.value : undefined;
    const sleepHours = sleepResult.status === 'fulfilled' ? sleepResult.value : undefined;

    if (steps === undefined && activeCalories === undefined && sleepHours === undefined) {
      return null;
    }

    return {
      steps,
      sleepHours,
      activeCalories,
      updatedAt: now.toISOString(),
    };
  }

  async openSettings(): Promise<void> {
    await Health.openHealthConnectSettings();
  }

  private async sum(
    dataType: 'steps' | 'calories',
    start: Date,
    end: Date,
  ): Promise<number | undefined> {
    const { samples } = await Health.queryAggregated({
      dataType,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      bucket: 'day',
      aggregation: 'sum',
    });

    const total = samples.reduce((value, sample) => value + sample.value, 0);
    return total > 0 ? Math.round(total) : undefined;
  }

  private async sleepHours(dateISO: string, now: Date): Promise<number | undefined> {
    const window = sleepWindow(dateISO, now);
    if (window.end.getTime() <= window.start.getTime()) {
      return undefined;
    }

    const { samples } = await Health.readSamples({
      dataType: 'sleep',
      startDate: window.start.toISOString(),
      endDate: window.end.toISOString(),
      limit: 100,
      ascending: true,
    });

    const intervals = samples
      .map(
        (sample) =>
          [Date.parse(sample.startDate), Date.parse(sample.endDate)] as const,
      )
      .filter(
        ([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start,
      )
      .map(
        ([start, end]) =>
          [
            Math.max(start, window.start.getTime()),
            Math.min(end, window.end.getTime()),
          ] as const,
      )
      .filter(([start, end]) => end > start);

    const duration = mergedDurationMs(intervals);
    return duration > 0 ? Math.round((duration / HOUR_MS) * 10) / 10 : undefined;
  }
}

export const capacitorHealth = new HealthConnectProvider();

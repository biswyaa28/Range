import type { AppState, BaseRecord } from '@/domain/types';
import type { Clock } from '@/domain/dates';
import { defaultClock } from '@/domain/dates';

export interface SingletonSnapshot {
  profile: string;
  layout: string;
  settings: string;
  days: Record<string, string>;
}

export function createSingletonSnapshot(state: AppState): SingletonSnapshot {
  const days: Record<string, string> = {};
  for (const k of Object.keys(state.dayStats)) {
    const val = state.dayStats[k];
    if (val) {
      days[k] = JSON.stringify(val);
    }
  }
  return {
    profile: JSON.stringify(state.profile),
    layout: JSON.stringify(state.layout),
    settings: JSON.stringify(state.settings),
    days,
  };
}

export function touchRecord<T extends { updatedAt: string }>(record: T, clock: Clock = defaultClock): T {
  record.updatedAt = clock.nowISO();
  return record;
}

export function stampNewRecord<T extends Partial<BaseRecord>>(
  partial: T,
  deviceId: string,
  uuidFn: () => string,
  clock: Clock = defaultClock,
): T & BaseRecord {
  const now = clock.nowISO();
  const res = {
    ...partial,
    id: partial.id || uuidFn(),
    createdAt: partial.createdAt || now,
    updatedAt: now,
    deleted: false,
    deviceId: partial.deviceId || deviceId,
  } as T & BaseRecord;
  return res;
}

export function softDeleteRecord<T extends BaseRecord>(
  coll: T[],
  id: string,
  clock: Clock = defaultClock,
): T | null {
  const r = coll.find((x) => x && x.id === id);
  if (r) {
    r.deleted = true;
    r.updatedAt = clock.nowISO();
    return r;
  }
  return null;
}

export function softUndeleteRecord<T extends BaseRecord>(
  rec: T | null | undefined,
  clock: Clock = defaultClock,
): T | null {
  if (rec) {
    rec.deleted = false;
    rec.updatedAt = clock.nowISO();
    return rec;
  }
  return null;
}

export function liveArray<T extends { deleted?: boolean }>(arr: T[] | null | undefined): T[] {
  return (arr || []).filter((x) => x && !x.deleted);
}

/**
 * Stamps updatedAt on any singletons or dayStats items that changed compared to snapshot.
 * Returns the new snapshot.
 */
export function diffAndStampSingletons(
  state: AppState,
  previousSnapshot: SingletonSnapshot,
  clock: Clock = defaultClock,
): SingletonSnapshot {
  const now = clock.nowISO();
  const currentSnap = createSingletonSnapshot(state);

  if (currentSnap.profile !== previousSnapshot.profile) {
    state.profile.updatedAt = now;
  }
  if (currentSnap.layout !== previousSnapshot.layout) {
    state.layout.updatedAt = now;
  }
  if (currentSnap.settings !== previousSnapshot.settings) {
    state.settings.updatedAt = now;
  }

  const seenDays: Record<string, number> = {};
  for (const k of Object.keys(currentSnap.days)) seenDays[k] = 1;
  for (const k of Object.keys(previousSnapshot.days)) seenDays[k] = 1;

  for (const k of Object.keys(seenDays)) {
    if (currentSnap.days[k] !== previousSnapshot.days[k]) {
      const item = state.dayStats[k];
      if (item) {
        item.updatedAt = now;
      }
    }
  }

  // Re-snapshot AFTER stamping timestamps
  return createSingletonSnapshot(state);
}

import type { SyncCursor } from '@/store/syncState';

/**
 * Pulls start slightly before the last cursor so a device whose clock runs
 * behind ours cannot have its newest writes skipped by the range query.
 */
export const PULL_OVERLAP_MS = 10 * 60_000;

/** At least one full pull a day, so a missed range query cannot hide writes. */
export const FULL_PULL_INTERVAL_MS = 24 * 60 * 60_000;

/**
 * A cursor older than this means the device was away long enough for remote
 * tombstones to expire, so the pull reads everything instead of a range.
 */
export const STALE_CURSOR_MS = 60 * 24 * 60 * 60_000;

export type PullReason =
  | 'incremental'
  | 'first-sync'
  | 'account-change'
  | 'invalid-cursor'
  | 'schema-migration'
  | 'stale-cursor'
  | 'daily-full-pull';

export interface PullPlan {
  /** `null` reads every collection. */
  since: string | null;
  full: boolean;
  reason: PullReason;
}

/**
 * Decides whether the next pull reads everything or only what changed.
 *
 * A cursor is only usable when it belongs to the same account, was written
 * under the current schema, is not older than the stale window, and a full
 * pull has happened within the last day.
 */
export function planPull(
  cursor: SyncCursor | null,
  accountUid: string,
  nowISO: string,
  schema: number,
): PullPlan {
  if (!cursor) return { since: null, full: true, reason: 'first-sync' };
  if (cursor.accountUid !== accountUid) {
    return { since: null, full: true, reason: 'account-change' };
  }
  if (cursor.schema !== schema) {
    return { since: null, full: true, reason: 'schema-migration' };
  }

  const now = Date.parse(nowISO);
  const lastPull = cursor.lastPullAt ? Date.parse(cursor.lastPullAt) : Number.NaN;
  if (!Number.isFinite(now) || !Number.isFinite(lastPull)) {
    return { since: null, full: true, reason: 'invalid-cursor' };
  }

  if (now - lastPull > STALE_CURSOR_MS) {
    return { since: null, full: true, reason: 'stale-cursor' };
  }

  const lastFull = cursor.lastFullPullAt ? Date.parse(cursor.lastFullPullAt) : Number.NaN;
  if (!Number.isFinite(lastFull) || now - lastFull >= FULL_PULL_INTERVAL_MS) {
    return { since: null, full: true, reason: 'daily-full-pull' };
  }

  return {
    since: new Date(lastPull - PULL_OVERLAP_MS).toISOString(),
    full: false,
    reason: 'incremental',
  };
}

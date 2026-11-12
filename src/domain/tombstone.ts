/**
 * How long a soft delete stays recoverable.
 *
 * The remote keeps the tombstone for this long (a Firestore TTL policy drops
 * it afterwards) and the local copy is hard-removed once the tombstone has
 * been pushed and has aged past the retention span.
 */
export const TOMBSTONE_TTL_DAYS = 90;

/** Milliseconds in a day, used by the retention spans. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant a tombstone written at `updatedAt` stops being recoverable. */
export function tombstoneExpiresAt(updatedAt: string, ttlDays = TOMBSTONE_TTL_DAYS): number {
  const updated = Date.parse(updatedAt);
  if (!Number.isFinite(updated)) return Number.NaN;
  return updated + ttlDays * DAY_MS;
}

/** The smallest shape the expiry helper needs from a timestamp type. */
export interface TimestampFactory<T> {
  fromDate(date: Date): T;
}

/**
 * Adds the TTL timestamp to a soft-deleted record.
 *
 * `expireAt` is a Firestore timestamp rather than a string, because the TTL
 * policy only acts on timestamps. It is only ever written on a tombstone:
 * a live record keeps no expiry, so restoring the record is a plain write.
 */
export function withTombstoneExpiry<T extends Record<string, unknown>>(
  record: T,
  timestamps: TimestampFactory<unknown>,
  ttlDays = TOMBSTONE_TTL_DAYS,
): T & { expireAt?: unknown } {
  if (!record['deleted']) return record;
  const expiresAt = tombstoneExpiresAt(String(record['updatedAt'] ?? ''), ttlDays);
  if (!Number.isFinite(expiresAt)) return record;
  return { ...record, expireAt: timestamps.fromDate(new Date(expiresAt)) };
}

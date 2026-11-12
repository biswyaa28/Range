import type { DayStats } from '@/domain/types';
import { oldestDayKey } from '@/domain/statsRetention';

/**
 * Top-level keys of the `state/app` document. `firestore.rules` allows
 * exactly this list, and a unit test keeps the two in step.
 */
export const STATE_APP_KEYS = ['profile', 'layout', 'settings'] as const;

/**
 * Keys an earlier build wrote into `state/app` and that the rules still
 * accept so an existing account keeps reading its own data.
 */
export const LEGACY_STATE_APP_KEYS = ['dayStats'] as const;

/** Every key `firestore.rules` accepts in the `state/app` document. */
export const STATE_APP_ALLOWED_KEYS = [
  ...STATE_APP_KEYS,
  ...LEGACY_STATE_APP_KEYS,
] as const;

export type StateAppKey = (typeof STATE_APP_KEYS)[number];

/**
 * Firestore rejects documents over 1 MiB and the rules reject anything over
 * 500 KB. The app stops well below the rule limit so a document close to the
 * cap still passes, with room for the metadata Firestore adds.
 */
export const STATE_APP_MAX_BYTES = 400 * 1024;

export interface StateAppParts {
  profile?: unknown;
  layout?: unknown;
  settings?: unknown;
}

export interface StateAppPayload {
  profile?: unknown;
  layout?: unknown;
  settings?: unknown;
}

export interface CappedDayStats {
  dayStats: Record<string, DayStats>;
  /** Days dropped to bring the document under the byte cap. */
  droppedDays: number;
}

/** UTF-8 length of a string, without depending on a platform encoder. */
export function utf8Length(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      // Surrogate pair: the pair encodes one four-byte code point.
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/** Serialized size of the `state/stats` document. */
export function dayStatsBytes(dayStats: Record<string, DayStats>): number {
  return utf8Length(JSON.stringify(dayStats));
}

/**
 * Builds the `state/app` document, keeping only the allowed top-level keys.
 */
export function buildStateAppPayload(parts: StateAppParts): StateAppPayload {
  const payload: StateAppPayload = {};
  if (parts.profile !== undefined && parts.profile !== null) payload.profile = parts.profile;
  if (parts.layout !== undefined && parts.layout !== null) payload.layout = parts.layout;
  if (parts.settings !== undefined && parts.settings !== null) payload.settings = parts.settings;
  return payload;
}

/**
 * Caps the serialized day map by dropping the oldest days first. The days
 * that remain are the ones the screens still read, so trimming loses old
 * history rather than recent activity.
 *
 * The size of every day is measured once and the cut point is worked out
 * from those measurements, so a map with thousands of days does not cost one
 * serialization per dropped day.
 */
export function capDayStats(
  dayStats: Record<string, DayStats>,
  maxBytes: number = STATE_APP_MAX_BYTES,
): CappedDayStats {
  const keys = Object.keys(dayStats).sort();
  if (keys.length === 0) return { dayStats: {}, droppedDays: 0 };

  // The serialized form of a map is `{"key":value,"key":value}`, so the size
  // of every entry is known once its value has been serialized.
  const serialized = keys.map((key) => JSON.stringify(dayStats[key] ?? null));
  const entryBytes = keys.map(
    (key, index) =>
      utf8Length(JSON.stringify(key)) + 1 + utf8Length(serialized[index] ?? 'null'),
  );

  // Keep the newest days; the oldest ones fall off the front.
  let first = keys.length;
  let total = 2; // The braces around the map.
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    const size = entryBytes[index] ?? 0;
    const separator = first < keys.length ? 1 : 0;
    if (total + separator + size > maxBytes) break;
    total += separator + size;
    first = index;
  }

  const kept: Record<string, DayStats> = {};
  for (let index = first; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) continue;
    const stats = dayStats[key];
    if (stats === undefined) continue;
    kept[key] = stats;
  }

  // The measurement above is exact, but a day can hold a value whose
  // serialized form differs between two runs, so the result is verified.
  while (Object.keys(kept).length > 0 && dayStatsBytes(kept) > maxBytes) {
    const oldest = oldestDayKey(kept);
    if (oldest === null) break;
    delete kept[oldest];
  }

  return { dayStats: kept, droppedDays: keys.length - Object.keys(kept).length };
}

import type { AppState, BaseRecord, DayStats } from '@/domain/types';
import { EPOCH_TS } from '@/domain/types';
import { normTs } from '@/domain/dates';
import type { IdGen } from '@/domain/id';
import { defaultIdGen } from '@/domain/id';

/**
 * A remote timestamp more than this far ahead of the local clock is treated
 * as a broken clock rather than a real edit.
 */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export interface MergeSummary {
  added: number;
  updated: number;
  deleted: number;
  ignored: number;
}

export interface MergeOptions {
  /** Local clock reading used to clamp and to break ties. */
  now?: string;
}

/**
 * LWW ordering with a deterministic tiebreak: when two devices stamp the same
 * millisecond, the higher deviceId wins so both sides converge on one value
 * instead of each keeping its own record forever.
 */
function wins(inc: Record<string, unknown> & BaseRecord, cur: Record<string, unknown>): boolean {
  const incoming = String(inc.updatedAt || EPOCH_TS);
  const current = String(cur['updatedAt'] || EPOCH_TS);
  if (incoming !== current) return incoming > current;
  return String(inc.deviceId ?? '') > String(cur['deviceId'] ?? '');
}

/**
 * Order-independent JSON of a value, so two devices comparing the same pair
 * of documents always pick the same winner.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value === undefined ? null : value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`);
  return `{${parts.join(',')}}`;
}

/** Clamps a timestamp that runs too far ahead of the local clock. */
function clampToNow(iso: string, nowMs: number): string {
  const value = Date.parse(iso);
  if (!Number.isFinite(value) || value <= nowMs + MAX_CLOCK_SKEW_MS) return iso;
  return new Date(nowMs).toISOString();
}

function prepRemote(
  r: Record<string, unknown>,
  localDeviceId: string,
  idGen: IdGen,
  nowMs: number,
): Record<string, unknown> & BaseRecord {
  const o: Record<string, unknown> = { ...r };
  if (!o['id'] || typeof o['id'] !== 'string') {
    o['id'] = idGen.uuid();
  }
  const c = normTs(o['createdAt']);
  const u = normTs(o['updatedAt']);
  const createdAt = clampToNow(c || u || EPOCH_TS, nowMs);
  const updatedAt = clampToNow(u || createdAt, nowMs);

  o['createdAt'] = createdAt;
  o['updatedAt'] = updatedAt;
  o['deleted'] = !!o['deleted'];
  if (!o['deviceId']) {
    o['deviceId'] = localDeviceId;
  }
  return o as Record<string, unknown> & BaseRecord;
}

/** Coerces a remote day entry into the local shape, ignoring junk fields. */
function sanitizeDayStats(iso: string, raw: Record<string, unknown>): DayStats {
  const num = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return {
    date: iso,
    blocksDone: num(raw['blocksDone']),
    blocksTotal: num(raw['blocksTotal']),
    tasksDone: num(raw['tasksDone']),
    focusMinutes: num(raw['focusMinutes']),
    updatedAt: EPOCH_TS,
  };
}

/**
 * Merge remote change set into local state with per-id last-write-wins (LWW) resolution.
 * - Compares updatedAt strings.
 * - Newer updatedAt wins.
 * - Older or equal updatedAt is ignored.
 * - Tombstone (deleted=true) wins only if newer; an older edit never resurrects a tombstone.
 * - Timestamps more than five minutes ahead of the local clock are clamped to now.
 * - Equal timestamps resolve by deviceId, or by a canonical comparison for the
 *   singletons and day entries, which carry no device id.
 * - Mutates target state in place.
 * Returns MergeSummary { added, updated, deleted, ignored }.
 */
export function mergeRemote(
  targetState: AppState,
  remote: unknown,
  idGen: IdGen = defaultIdGen,
  options: MergeOptions = {},
): MergeSummary {
  const sum: MergeSummary = { added: 0, updated: 0, deleted: 0, ignored: 0 };
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return sum;

  const nowMs = Date.parse(options.now ?? new Date().toISOString());
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();

  const remObj = remote as Record<string, unknown>;
  const collKeys = ['blocks', 'tasks', 'notes', 'deadlines', 'habits'] as const;

  collKeys.forEach((k) => {
    const list = Array.isArray(remObj[k]) ? (remObj[k] as Record<string, unknown>[]) : [];
    const targetColl = targetState[k] as unknown as Record<string, unknown>[];

    list.forEach((r) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return;
      const inc = prepRemote(r, targetState.deviceId, idGen, safeNowMs);
      const cur = targetColl.find((x) => x['id'] === inc.id);

      if (!cur) {
        targetColl.push(inc);
        sum.added++;
        return;
      }

      if (wins(inc, cur)) {
        const wasDel = !!cur['deleted'];
        const nowDel = !!inc.deleted;
        // Replace in place
        for (const kk of Object.keys(cur)) {
          if (!(kk in inc)) delete cur[kk];
        }
        Object.assign(cur, inc);
        if (nowDel && !wasDel) {
          sum.deleted++;
        } else {
          sum.updated++;
        }
      } else {
        sum.ignored++;
      }
    });
  });

  const singletonKeys = ['profile', 'layout', 'settings'] as const;
  singletonKeys.forEach((k) => {
    const r = remObj[k];
    if (!r || typeof r !== 'object' || Array.isArray(r)) return;
    const rObj = { ...(r as Record<string, unknown>) };
    const curObj = targetState[k] as unknown as Record<string, unknown>;

    if (typeof rObj['updatedAt'] === 'string') {
      rObj['updatedAt'] = clampToNow(rObj['updatedAt'], safeNowMs);
    }
    const incoming = String(rObj['updatedAt'] || EPOCH_TS);
    const current = String(curObj['updatedAt'] || EPOCH_TS);
    // Equal timestamps resolve on a canonical comparison: both devices hold the
    // same two documents, so they pick the same winner.
    const newer =
      incoming > current ||
      (incoming === current && canonicalJson(rObj) > canonicalJson(curObj));

    if (newer) {
      for (const kk of Object.keys(curObj)) {
        if (!(kk in rObj)) delete curObj[kk];
      }
      Object.assign(curObj, rObj);
      sum.updated++;
    } else {
      sum.ignored++;
    }
  });

  if (
    remObj['dayStats'] &&
    typeof remObj['dayStats'] === 'object' &&
    !Array.isArray(remObj['dayStats'])
  ) {
    const remDays = remObj['dayStats'] as Record<string, Record<string, unknown>>;
    for (const iso of Object.keys(remDays)) {
      const r = remDays[iso];
      if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
      const incoming = sanitizeDayStats(iso, r);
      const incomingTs = clampToNow(
        typeof r['updatedAt'] === 'string' ? r['updatedAt'] : EPOCH_TS,
        safeNowMs,
      );
      incoming.updatedAt = incomingTs;
      const cur = targetState.dayStats[iso];
      if (!cur) {
        targetState.dayStats[iso] = incoming;
        sum.added++;
        continue;
      }
      const current = String(cur.updatedAt || EPOCH_TS);
      const newer =
        incomingTs > current ||
        (incomingTs === current && canonicalJson(incoming) > canonicalJson(cur));
      if (newer) {
        targetState.dayStats[iso] = incoming;
        sum.updated++;
      } else {
        sum.ignored++;
      }
    }
  }

  return sum;
}

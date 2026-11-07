import type { AppState, BaseRecord, DayStats } from '@/domain/types';
import { EPOCH_TS } from '@/domain/types';
import { normTs } from '@/domain/dates';
import type { IdGen } from '@/domain/id';
import { defaultIdGen } from '@/domain/id';

export interface MergeSummary {
  added: number;
  updated: number;
  deleted: number;
  ignored: number;
}

function prepRemote(
  r: Record<string, unknown>,
  localDeviceId: string,
  idGen: IdGen,
): Record<string, unknown> & BaseRecord {
  const o: Record<string, unknown> = { ...r };
  if (!o['id'] || typeof o['id'] !== 'string') {
    o['id'] = idGen.uuid();
  }
  const c = normTs(o['createdAt']);
  const u = normTs(o['updatedAt']);
  const createdAt = c || u || EPOCH_TS;
  const updatedAt = u || createdAt;

  o['createdAt'] = createdAt;
  o['updatedAt'] = updatedAt;
  o['deleted'] = !!o['deleted'];
  if (!o['deviceId']) {
    o['deviceId'] = localDeviceId;
  }
  return o as Record<string, unknown> & BaseRecord;
}

/**
 * Merge remote change set into local state with per-id last-write-wins (LWW) resolution.
 * - Compares updatedAt strings.
 * - Newer updatedAt wins.
 * - Older or equal updatedAt is ignored.
 * - Tombstone (deleted=true) wins only if newer; an older edit never resurrects a tombstone.
 * - Mutates target state in place.
 * Returns MergeSummary { added, updated, deleted, ignored }.
 */
export function mergeRemote(
  targetState: AppState,
  remote: unknown,
  idGen: IdGen = defaultIdGen,
): MergeSummary {
  const sum: MergeSummary = { added: 0, updated: 0, deleted: 0, ignored: 0 };
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return sum;

  const remObj = remote as Record<string, unknown>;
  const collKeys = ['blocks', 'tasks', 'notes', 'deadlines'] as const;

  collKeys.forEach((k) => {
    const list = Array.isArray(remObj[k]) ? (remObj[k] as Record<string, unknown>[]) : [];
    const targetColl = targetState[k] as unknown as Record<string, unknown>[];

    list.forEach((r) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return;
      const inc = prepRemote(r, targetState.deviceId, idGen);
      const cur = targetColl.find((x) => x['id'] === inc.id);

      if (!cur) {
        targetColl.push(inc);
        sum.added++;
        return;
      }

      if (String(inc.updatedAt) > String(cur['updatedAt'] || EPOCH_TS)) {
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
    const rObj = r as Record<string, unknown>;
    const curObj = targetState[k] as unknown as Record<string, unknown>;

    if (String(rObj['updatedAt'] || EPOCH_TS) > String(curObj['updatedAt'] || EPOCH_TS)) {
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
      const cur = targetState.dayStats[iso];
      if (!cur) {
        const newStats: DayStats = {
          date: iso,
          blocksDone: typeof r['blocksDone'] === 'number' ? r['blocksDone'] : 0,
          blocksTotal: typeof r['blocksTotal'] === 'number' ? r['blocksTotal'] : 0,
          tasksDone: typeof r['tasksDone'] === 'number' ? r['tasksDone'] : 0,
          focusMinutes: typeof r['focusMinutes'] === 'number' ? r['focusMinutes'] : 0,
          updatedAt: typeof r['updatedAt'] === 'string' ? r['updatedAt'] : EPOCH_TS,
        };
        targetState.dayStats[iso] = newStats;
        sum.added++;
      } else if (String(r['updatedAt'] || EPOCH_TS) > String(cur.updatedAt || EPOCH_TS)) {
        const curRecord = cur as unknown as Record<string, unknown>;
        for (const kk of Object.keys(curRecord)) {
          if (!(kk in r)) delete curRecord[kk];
        }
        Object.assign(curRecord, r, { date: iso });
        sum.updated++;
      } else {
        sum.ignored++;
      }
    }
  }

  return sum;
}

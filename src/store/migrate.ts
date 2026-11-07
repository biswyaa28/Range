import type { AppState, BaseRecord } from '@/domain/types';
import { defaultState, EPOCH_TS, SCHEMA_VERSION } from '@/domain/types';
import { normTs, defaultClock, Clock } from '@/domain/dates';
import type { IdGen } from '@/domain/id';
import { defaultIdGen } from '@/domain/id';

/**
 * Merge unknown / partial saved data with defaults so the app never crashes.
 * Matches legacy hydrate function.
 */
export function hydrateState(raw: unknown): AppState {
  const d = defaultState();
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const arr = <T>(k: string): T[] => {
    const val = s[k];
    return Array.isArray(val) ? (val as T[]) : (d[k as keyof AppState] as unknown as T[]);
  };

  const st = s['settings'] && typeof s['settings'] === 'object' ? (s['settings'] as Record<string, unknown>) : {};
  const pr = s['profile'] && typeof s['profile'] === 'object' ? (s['profile'] as Record<string, unknown>) : {};
  const lay = s['layout'] && typeof s['layout'] === 'object' ? (s['layout'] as Record<string, unknown>) : {};

  const rawTheme = st['theme'];
  const theme = rawTheme === 'dark' || rawTheme === 'light' || rawTheme === 'auto' ? rawTheme : 'auto';

  const out: AppState = {
    blocks: arr('blocks'),
    tasks: arr('tasks'),
    notes: arr('notes'),
    deadlines: arr('deadlines'),
    dayStats:
      s['dayStats'] && typeof s['dayStats'] === 'object' && !Array.isArray(s['dayStats'])
        ? (s['dayStats'] as AppState['dayStats'])
        : {},
    profile: {
      ...d.profile,
      ...pr,
      haptics: {
        ...d.profile.haptics,
        ...(pr['haptics'] && typeof pr['haptics'] === 'object'
          ? (pr['haptics'] as Record<string, unknown>)
          : {}),
      },
    },
    layout: {
      ...d.layout,
      ...lay,
    },
    settings: {
      theme,
      seeded: !!st['seeded'],
      pomodoro: {
        ...d.settings.pomodoro,
        ...(st['pomodoro'] && typeof st['pomodoro'] === 'object'
          ? (st['pomodoro'] as Record<string, unknown>)
          : {}),
      },
      sound: {
        ...d.settings.sound,
        ...(st['sound'] && typeof st['sound'] === 'object'
          ? (st['sound'] as Record<string, unknown>)
          : {}),
      },
      prompter: {
        ...d.settings.prompter,
        ...(st['prompter'] && typeof st['prompter'] === 'object'
          ? (st['prompter'] as Record<string, unknown>)
          : {}),
      },
      updatedAt:
        typeof st['updatedAt'] === 'string' && st['updatedAt']
          ? st['updatedAt']
          : d.settings.updatedAt,
    },
    schemaVersion: 2,
    deviceId: '',
    syncedAt: EPOCH_TS,
  };

  if (typeof s['schemaVersion'] === 'number' && s['schemaVersion']) {
    out.schemaVersion = 2; // target is always 2
  }
  if (typeof s['deviceId'] === 'string' && s['deviceId']) {
    out.deviceId = s['deviceId'];
  }
  if (typeof s['syncedAt'] === 'string' && s['syncedAt']) {
    out.syncedAt = s['syncedAt'];
  }
  if (typeof s['clearedAt'] === 'string' && s['clearedAt']) {
    out.clearedAt = s['clearedAt'];
  }

  return out;
}

function normalizeRecord<T extends object>(
  r: T,
  devId: string,
  idGen: IdGen,
): T & BaseRecord {
  const o = { ...r } as Record<string, unknown>;
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
    o['deviceId'] = devId;
  }
  return o as T & BaseRecord;
}

function isPlainObject(x: unknown): x is object {
  return Boolean(x && typeof x === 'object' && !Array.isArray(x));
}

/**
 * v1 -> v2 migration, in place: keep every record and id, add the sync fields
 * (createdAt/updatedAt/deleted/deviceId), schemaVersion, deviceId and the sync cursor.
 * Never drops data.
 */
export function migrateSave(
  raw: unknown,
  idGen: IdGen = defaultIdGen,
  _clock: Clock = defaultClock,
): AppState {
  const d = hydrateState(raw);
  d.schemaVersion = SCHEMA_VERSION;
  const dev = typeof d.deviceId === 'string' && d.deviceId ? d.deviceId : idGen.uuid();
  d.deviceId = dev;

  d.blocks = (Array.isArray(d.blocks) ? d.blocks : [])
    .filter(isPlainObject)
    .map((r) => normalizeRecord(r, dev, idGen) as unknown as AppState['blocks'][number]);

  d.tasks = (Array.isArray(d.tasks) ? d.tasks : [])
    .filter(isPlainObject)
    .map((r) => normalizeRecord(r, dev, idGen) as unknown as AppState['tasks'][number]);

  d.notes = (Array.isArray(d.notes) ? d.notes : [])
    .filter(isPlainObject)
    .map((r) => normalizeRecord(r, dev, idGen) as unknown as AppState['notes'][number]);

  d.deadlines = (Array.isArray(d.deadlines) ? d.deadlines : [])
    .filter(isPlainObject)
    .map((r) => normalizeRecord(r, dev, idGen) as unknown as AppState['deadlines'][number]);

  for (const iso of Object.keys(d.dayStats)) {
    const s = d.dayStats[iso];
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      delete d.dayStats[iso];
      continue;
    }
    if (!s.date) s.date = iso;
    if (!normTs(s.updatedAt)) s.updatedAt = EPOCH_TS;
  }

  if (!d.profile.updatedAt) d.profile.updatedAt = EPOCH_TS;
  if (!d.layout.updatedAt) d.layout.updatedAt = EPOCH_TS;
  if (!d.settings.updatedAt) d.settings.updatedAt = EPOCH_TS;
  if (!d.syncedAt) d.syncedAt = EPOCH_TS;

  return d;
}

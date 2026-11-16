import type { AppState, DayStats, BaseRecord } from '@/domain/types';
import { STORAGE_KEY, BACKUP_KEY, EPOCH_TS, defaultState } from '@/domain/types';
import type { StorageAdapter } from '@/platform/types';
import { storage as defaultStorage } from '@/platform';
import type { Clock } from '@/domain/dates';
import { defaultClock, todayISO } from '@/domain/dates';
import {
  pruneDayStatsByAge,
  STATS_RETENTION_DAYS,
  statsCutoffISO,
} from '@/domain/statsRetention';
import { TOMBSTONE_TTL_DAYS } from '@/domain/tombstone';
import { clampAppStateNotes } from '@/domain/limits';
import type { IdGen } from '@/domain/id';
import { defaultIdGen } from '@/domain/id';
import { createSingletonSnapshot, diffAndStampSingletons, nextStamp, SingletonSnapshot } from './stamp';
import { migrateSave } from './migrate';
import { mergeRemote, MergeSummary } from './merge';
import { reportWriteFailure, reportWriteSuccess } from './persistenceStatus';

export type StoreSubscriber = (state: AppState) => void;

export interface PendingChangesResult {
  since: string;
  blocks: AppState['blocks'];
  tasks: AppState['tasks'];
  notes: AppState['notes'];
  deadlines: AppState['deadlines'];
  habits: AppState['habits'];
  profile: AppState['profile'] | null;
  layout: AppState['layout'] | null;
  settings: AppState['settings'] | null;
  dayStats: Record<string, DayStats>;
}

export interface StoreOptions {
  storage?: StorageAdapter;
  clock?: Clock;
  idGen?: IdGen;
  debounceMs?: number;
}

export class PersonalStore {
  private data: AppState;
  private snap: SingletonSnapshot;
  private subs: StoreSubscriber[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly storage: StorageAdapter;
  private readonly clock: Clock;
  private readonly idGen: IdGen;
  private readonly debounceMs: number;

  constructor(options: StoreOptions = {}) {
    this.storage = options.storage ?? defaultStorage;
    this.clock = options.clock ?? defaultClock;
    this.idGen = options.idGen ?? defaultIdGen;
    this.debounceMs = options.debounceMs ?? 50;

    this.data = this.load();
    this.snap = createSingletonSnapshot(this.data);
  }

  private load(): AppState {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch {
      // storage unavailable
    }

    let loadedState: AppState;
    if (raw == null) {
      loadedState = defaultState();
    } else {
      let obj: unknown = null;
      try {
        obj = JSON.parse(raw);
      } catch {
        // unreadable save: keep the bytes under the backup key, start clean
        try {
          this.storage.setItem(BACKUP_KEY, raw);
        } catch {
          // ignore
        }
        loadedState = defaultState();
      }
      if (obj) {
        loadedState = migrateSave(obj, this.idGen, this.clock);
      } else {
        loadedState = defaultState();
      }
    }

    if (!loadedState.deviceId) {
      loadedState.deviceId = this.idGen.uuid();
    }

    // One-time adoption of the pre-v2 name preference key if present
    if (!loadedState.profile.name) {
      try {
        const rawPrefs = this.storage.getItem('personalOS_prefs_v1');
        if (rawPrefs) {
          const p = JSON.parse(rawPrefs) as { name?: string };
          if (p && typeof p.name === 'string' && p.name.trim()) {
            loadedState.profile.name = p.name.trim().slice(0, 40);
            this.storage.removeItem('personalOS_prefs_v1');
          }
        }
      } catch {
        // ignore
      }
    }

    if (raw != null) {
      this.writeNowState(loadedState);
    }
    return loadedState;
  }

  private writeNowState(stateToWrite: AppState): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(stateToWrite));
      reportWriteSuccess('state');
    } catch {
      // Never sacrifice BACKUP_KEY here: it holds the only copy of an
      // unreadable save. Keep the new state in memory and let the user retry.
      reportWriteFailure('state');
    }
  }

  private notify(): void {
    for (const sub of this.subs) {
      try {
        sub(this.data);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  private scheduleFlush(): void {
    if (this.debounceMs <= 0) {
      this.writeNowState(this.data);
      return;
    }
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.writeNowState(this.data);
    }, this.debounceMs);
  }

  get(): AppState {
    return this.data;
  }

  get deviceId(): string {
    return this.data.deviceId;
  }

  set(mutator?: (state: AppState) => void): void {
    if (typeof mutator === 'function') {
      mutator(this.data);
    }
    this.enforceStatsRetention();
    this.snap = diffAndStampSingletons(this.data, this.snap, this.clock);
    this.data = {
      ...this.data,
      profile: { ...this.data.profile },
      settings: { ...this.data.settings },
      layout: { ...this.data.layout },
      blocks: [...this.data.blocks],
      tasks: [...this.data.tasks],
      notes: [...this.data.notes],
      deadlines: [...this.data.deadlines],
      habits: [...this.data.habits],
      dayStats: { ...this.data.dayStats },
    };
    this.notify();
    this.scheduleFlush();
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.writeNowState(this.data);
    this.notify();
  }

  subscribe(fn: StoreSubscriber): () => void {
    if (typeof fn === 'function') {
      this.subs.push(fn);
    }
    return () => {
      this.subs = this.subs.filter((s) => s !== fn);
    };
  }

  exportAll(): AppState {
    return JSON.parse(JSON.stringify(this.data)) as AppState;
  }

  importAll(json: unknown): AppState {
    const prevDev = this.data ? this.data.deviceId : '';
    const obj = json && typeof json === 'object' && !Array.isArray(json) ? json : defaultState();
    this.data = migrateSave(obj, this.idGen, this.clock);
    // Imports and restored saves bypass the note editor's maxLength.
    clampAppStateNotes(this.data);
    if (prevDev) {
      this.data.deviceId = prevDev; // device identity survives imports and wipes
    }
    if (!this.data.deviceId) {
      this.data.deviceId = this.idGen.uuid();
    }
    this.snap = createSingletonSnapshot(this.data);
    this.flush();
    return this.data;
  }

  /**
   * Bounds the synced day map. Days are keyed by ISO date and the widest screen
   * reads 400 back, so anything older than the retention window is dropped. The
   * count guard keeps the per-update cost at zero until the map actually grows.
   */
  private enforceStatsRetention(): void {
    if (Object.keys(this.data.dayStats).length <= STATS_RETENTION_DAYS + 30) return;
    const cutoff = statsCutoffISO(todayISO(this.clock));
    this.data.dayStats = pruneDayStatsByAge(this.data.dayStats, cutoff).dayStats;
  }

  /**
   * Hard-removes tombstones the remote has already seen and that are past the
   * retention window. The remote drops them too (the TTL timestamp on the
   * document), so keeping a copy here only grows the local save. A tombstone
   * that was never pushed stays: it is the only record of the deletion.
   */
  gcExpiredTombstones(nowISO: string, ttlDays = TOMBSTONE_TTL_DAYS): number {
    const now = Date.parse(nowISO);
    if (!Number.isFinite(now)) return 0;
    const cutoff = now - ttlDays * 24 * 60 * 60 * 1000;
    const since = String(this.data.syncedAt || EPOCH_TS);

    let removed = 0;
    const prune = <T extends BaseRecord>(list: T[]): T[] => {
      const kept: T[] = [];
      for (const record of list) {
        const updatedAt = String(record.updatedAt || EPOCH_TS);
        const expired = Date.parse(updatedAt);
        const synced = updatedAt <= since;
        if (record.deleted && synced && Number.isFinite(expired) && expired < cutoff) {
          removed += 1;
          continue;
        }
        kept.push(record);
      }
      return kept;
    };

    this.data.blocks = prune(this.data.blocks);
    this.data.tasks = prune(this.data.tasks);
    this.data.notes = prune(this.data.notes);
    this.data.deadlines = prune(this.data.deadlines);
    return removed;
  }

  /**
   * Soft-deletes records the remote has dropped.
   *
   * Used when a full pull shows that the remote no longer holds a record
   * this device once uploaded: the remote tombstone has expired, so the
   * record would otherwise be pushed back and resurrected.
   */
  tombstoneRecords(
    entries: Array<{ collection: 'blocks' | 'tasks' | 'notes' | 'deadlines' | 'habits'; id: string }>,
  ): number {
    if (entries.length === 0) return 0;
    let removed = 0;

    const apply = <T extends BaseRecord>(
      list: T[],
      ids: string[],
    ): T[] => {
      for (const id of ids) {
        const record = list.find((candidate) => candidate.id === id);
        if (!record || record.deleted) continue;
        record.deleted = true;
        record.updatedAt = nextStamp(record.updatedAt, this.clock);
        removed += 1;
      }
      return list;
    };

    const idsFor = (name: 'blocks' | 'tasks' | 'notes' | 'deadlines'): string[] =>
      entries.filter((entry) => entry.collection === name).map((entry) => entry.id);

    this.data.blocks = apply(this.data.blocks, idsFor('blocks'));
    this.data.tasks = apply(this.data.tasks, idsFor('tasks'));
    this.data.notes = apply(this.data.notes, idsFor('notes'));
    this.data.deadlines = apply(this.data.deadlines, idsFor('deadlines'));

    if (removed > 0) this.flush();
    return removed;
  }

  pendingChanges(): PendingChangesResult {
    const since = String(this.data.syncedAt || EPOCH_TS);
    const rec = (r: BaseRecord | null | undefined): boolean =>
      Boolean(r && String(r.updatedAt || EPOCH_TS) > since);
    const one = <T extends { updatedAt?: string }>(o: T | null | undefined): T | null =>
      o && String(o.updatedAt || EPOCH_TS) > since ? o : null;

    const days: Record<string, DayStats> = {};
    for (const k of Object.keys(this.data.dayStats)) {
      const ds = this.data.dayStats[k];
      if (ds && String(ds.updatedAt || EPOCH_TS) > since) {
        days[k] = ds;
      }
    }

    return {
      since,
      blocks: this.data.blocks.filter(rec),
      tasks: this.data.tasks.filter(rec),
      notes: this.data.notes.filter(rec),
      deadlines: this.data.deadlines.filter(rec),
      habits: this.data.habits.filter(rec),
      profile: one(this.data.profile),
      layout: one(this.data.layout),
      settings: one(this.data.settings),
      dayStats: days,
    };
  }

  markSynced(iso?: string): void {
    this.data.syncedAt = typeof iso === 'string' && iso ? iso : this.clock.nowISO();
    this.snap = createSingletonSnapshot(this.data);
    this.flush();
  }

  mergeRemote(remote: unknown): MergeSummary {
    const summary = mergeRemote(this.data, remote, this.idGen, {
      now: this.clock.nowISO(),
    });
    this.enforceStatsRetention();
    this.snap = createSingletonSnapshot(this.data);
    this.flush();
    return summary;
  }
}

// Global default store singleton
export const store = new PersonalStore();

// Attach flush listener on tab close/hidden when running in browser
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    try {
      store.flush();
    } catch {
      // ignore
    }
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try {
          store.flush();
        } catch {
          // ignore
        }
      }
    });
  }
}

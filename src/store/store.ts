import type { AppState, DayStats, BaseRecord } from '@/domain/types';
import { STORAGE_KEY, BACKUP_KEY, EPOCH_TS, defaultState } from '@/domain/types';
import type { StorageAdapter } from '@/platform/types';
import { storage as defaultStorage } from '@/platform';
import type { Clock } from '@/domain/dates';
import { defaultClock } from '@/domain/dates';
import type { IdGen } from '@/domain/id';
import { defaultIdGen } from '@/domain/id';
import { createSingletonSnapshot, diffAndStampSingletons, SingletonSnapshot } from './stamp';
import { migrateSave } from './migrate';
import { mergeRemote, MergeSummary } from './merge';

export type StoreSubscriber = (state: AppState) => void;

export interface PendingChangesResult {
  since: string;
  blocks: AppState['blocks'];
  tasks: AppState['tasks'];
  notes: AppState['notes'];
  deadlines: AppState['deadlines'];
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
    } catch {
      try {
        this.storage.removeItem(BACKUP_KEY);
        this.storage.setItem(STORAGE_KEY, JSON.stringify(stateToWrite));
      } catch {
        // failed write
      }
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
    const summary = mergeRemote(this.data, remote, this.idGen);
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

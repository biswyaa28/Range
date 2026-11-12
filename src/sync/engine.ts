import type { Clock } from '@/domain/dates';
import { defaultClock } from '@/domain/dates';
import type { Settings } from '@/domain/settings';
import type { BaseRecord } from '@/domain/types';
import { EPOCH_TS } from '@/domain/types';
import type { StorageAdapter } from '@/platform/types';
import type { PersonalStore } from '@/store/store';
import type { SettingsStore } from '@/store/settingsStore';
import { hasPendingPreferences, mergePreferences, redactPreferences } from './preferences';
import type {
  RemoteSnapshot,
  SyncAccount,
  SyncAdapter,
  SyncPush,
  SyncState,
  SyncStatus,
} from './types';

// Every sync pulls all four collections, so a short debounce burned Spark read
// quota during editing bursts. Manual "sync now" is unaffected.
const DEFAULT_AUTO_SYNC_MS = 15_000;
const SYNC_ACCOUNT_KEY = 'personalOS_sync_account_v1';

export interface SyncEngineOptions {
  adapter?: SyncAdapter | null;
  store: PersonalStore;
  settings: SettingsStore;
  /** Persists the last synced account so account switches re-upload locally. */
  storage?: StorageAdapter;
  clock?: Clock;
  isOnline?: () => boolean;
  onlineSubscription?: (listener: () => void) => () => void;
  /** Debounce for automatic pushes after local edits. `null` disables it. */
  autoSyncMs?: number | null;
}

type Listener = (state: SyncState) => void;

interface LocalChanges {
  since: string;
  blocks: Map<string, string>;
  tasks: Map<string, string>;
  notes: Map<string, string>;
  deadlines: Map<string, string>;
  profile: string | null;
  layout: string | null;
  appSettings: string | null;
  dayStats: Map<string, string>;
  preferences: Settings;
}

function browserOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
  return navigator.onLine;
}

function browserOnlineSubscription(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return String((error as { message: string }).message);
  }
  return 'Sync failed. Try again.';
}

function isCancellation(error: unknown): boolean {
  const code = errorCode(error);
  return (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/user-cancelled'
  );
}

function isOfflineError(error: unknown): boolean {
  const code = errorCode(error);
  if (
    code === 'unavailable' ||
    code === 'network-request-failed' ||
    code === 'auth/network-request-failed'
  ) {
    return true;
  }
  const message = errorMessage(error).toLowerCase();
  return message.includes('offline') || message.includes('network');
}

function sameState(a: SyncState, b: SyncState): boolean {
  return (
    a.configured === b.configured &&
    a.status === b.status &&
    a.account === b.account &&
    a.lastSyncedAt === b.lastSyncedAt &&
    a.pending === b.pending &&
    a.error === b.error
  );
}

/**
 * Owns the pull → merge → push loop, sync cursors and UI status. Adapters only
 * move bytes; conflict resolution remains in `@/store/merge` and
 * `./preferences`.
 */
export class SyncEngine {
  private readonly adapter: SyncAdapter | null;
  private readonly store: PersonalStore;
  private readonly settings: SettingsStore;
  private readonly storage: StorageAdapter | null;
  private readonly clock: Clock;
  private readonly isOnline: () => boolean;
  private readonly onlineSubscription: (listener: () => void) => () => void;
  private readonly autoSyncMs: number | null;

  private state: SyncState;
  private listeners: Listener[] = [];
  private lastUid: string | null = null;
  private started = false;
  private active: Promise<void> | null = null;
  private queued = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private mergingRemote = false;
  private pushing = false;
  private running = false;
  private localChangeDuringSync = false;

  private unsubAuth: (() => void) | null = null;
  private unsubOnline: (() => void) | null = null;
  private unsubStore: (() => void) | null = null;
  private unsubSettings: (() => void) | null = null;

  constructor(options: SyncEngineOptions) {
    this.adapter = options.adapter ?? null;
    this.store = options.store;
    this.settings = options.settings;
    this.storage = options.storage ?? null;
    this.clock = options.clock ?? defaultClock;
    this.isOnline = options.isOnline ?? browserOnline;
    this.onlineSubscription = options.onlineSubscription ?? browserOnlineSubscription;
    this.autoSyncMs =
      options.autoSyncMs === undefined ? DEFAULT_AUTO_SYNC_MS : options.autoSyncMs;
    this.lastUid = this.readLastUid();

    const cursor = this.store.get().syncedAt;
    this.state = {
      configured: this.adapter !== null,
      status: this.adapter ? 'signed-out' : 'disabled',
      account: null,
      lastSyncedAt: cursor && cursor !== EPOCH_TS ? cursor : null,
      pending: this.computePending(),
      error: null,
    };
  }

  getState = (): SyncState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  };

  start(): void {
    if (this.started || !this.adapter) return;
    this.started = true;

    this.unsubStore = this.store.subscribe(() => this.handleLocalChange());
    this.unsubSettings = this.settings.subscribe(() => this.handleLocalChange());
    this.unsubOnline = this.onlineSubscription(() => this.handleOnlineChange());
    this.unsubAuth = this.adapter.subscribeAuth(
      (account) => this.handleAuth(account),
      (error) => this.handleAdapterError(error),
    );
  }

  dispose(): void {
    this.started = false;
    this.queued = false;
    this.clearTimer();
    this.unsubAuth?.();
    this.unsubOnline?.();
    this.unsubStore?.();
    this.unsubSettings?.();
    this.unsubAuth = null;
    this.unsubOnline = null;
    this.unsubStore = null;
    this.unsubSettings = null;
  }

  async signIn(): Promise<void> {
    if (!this.adapter) return;
    this.setState({ error: null });
    try {
      await this.adapter.signInWithGoogle();
    } catch (error) {
      if (isCancellation(error)) return;
      this.setState({
        status: this.isOnline() ? 'error' : 'offline',
        error: isOfflineError(error) ? null : errorMessage(error),
      });
    }
  }

  async signOut(): Promise<void> {
    if (!this.adapter) return;
    this.setState({ error: null });
    try {
      await this.adapter.signOut();
    } catch (error) {
      this.setState({
        status: this.isOnline() ? 'error' : 'offline',
        error: isOfflineError(error) ? null : errorMessage(error),
      });
    }
  }

  syncNow(): Promise<void> {
    const adapter = this.adapter;
    const account = this.state.account;
    if (!adapter || !account) return Promise.resolve();
    if (this.active) {
      return this.active;
    }

    if (!this.isOnline()) {
      this.setState({ status: 'offline', pending: this.computePending(), error: null });
      return Promise.resolve();
    }

    const run = this.runSync(adapter, account).finally(() => {
      this.active = null;
      if (this.queued) {
        this.queued = false;
        if (this.state.account && this.isOnline()) void this.syncNow();
      }
    });
    this.active = run;
    return run;
  }

  private async runSync(adapter: SyncAdapter, account: SyncAccount): Promise<void> {
    this.running = true;
    this.localChangeDuringSync = false;
    this.setState({ status: 'syncing', error: null });

    const startedAt = this.clock.nowISO();
    let succeeded = false;
    let failure: unknown = null;

    try {
      const snapshot = await adapter.pull(account);
      if (this.state.account?.uid !== account.uid) {
        // Signed out or switched accounts while the pull was in flight.
        return;
      }
      // Capture local changes after the pull (so edits made while waiting are
      // included) but before the merge (so remote records are not echoed back).
      const localChanges = this.captureLocalChanges();
      const payload = this.applyRemoteAndBuildPush(snapshot, localChanges);

      this.pushing = true;
      try {
        await adapter.push(account, payload);
      } finally {
        this.pushing = false;
      }

      if (this.state.account?.uid === account.uid) {
        this.quiet(() => this.store.markSynced(startedAt));
      }
      succeeded = true;
    } catch (error) {
      failure = error;
    } finally {
      this.running = false;
      const current = this.state.account?.uid === account.uid;
      const pending = this.computePending();

      if (!current) {
        this.setState({ pending });
      } else if (succeeded) {
        this.setState({
          status: this.isOnline() ? 'idle' : 'offline',
          lastSyncedAt: startedAt,
          pending,
          error: null,
        });
      } else {
        const offline = !this.isOnline() || isOfflineError(failure);
        this.setState({
          status: offline ? 'offline' : 'error',
          pending,
          error: offline ? null : errorMessage(failure),
        });
      }

      if (this.localChangeDuringSync) {
        this.localChangeDuringSync = false;
        this.scheduleSync();
      }
    }
  }

  private applyRemoteAndBuildPush(
    snapshot: RemoteSnapshot,
    local: LocalChanges,
  ): SyncPush {
    return this.quiet(() => {
      this.store.mergeRemote({
        blocks: snapshot.blocks,
        tasks: snapshot.tasks,
        notes: snapshot.notes,
        deadlines: snapshot.deadlines,
        profile: snapshot.profile ?? undefined,
        layout: snapshot.layout ?? undefined,
        settings: snapshot.appSettings ?? undefined,
        dayStats: snapshot.dayStats ?? undefined,
      });

      const merged = mergePreferences(this.settings.get(), snapshot.preferences);
      if (merged) this.settings.replace(merged, { stamp: false });

      const state = this.store.get();
      const pick = <T extends BaseRecord>(
        list: T[],
        fingerprints: Map<string, string>,
      ): T[] =>
        list.filter(
          (record) => fingerprints.get(record.id) === String(record.updatedAt),
        );
      const dayChanged = [...local.dayStats.entries()].some(
        ([date, updatedAt]) => state.dayStats[date]?.updatedAt === updatedAt,
      );
      const mergedPreferences = this.settings.get();

      return {
        blocks: pick(state.blocks, local.blocks),
        tasks: pick(state.tasks, local.tasks),
        notes: pick(state.notes, local.notes),
        deadlines: pick(state.deadlines, local.deadlines),
        profile:
          local.profile !== null && String(state.profile.updatedAt) === local.profile
            ? state.profile
            : null,
        layout:
          local.layout !== null && String(state.layout.updatedAt) === local.layout
            ? state.layout
            : null,
        appSettings:
          local.appSettings !== null &&
          String(state.settings.updatedAt) === local.appSettings
            ? state.settings
            : null,
        // Day stats live in one map; send the full set whenever a day changed
        // so a merge write can never drop untouched days on another device.
        dayStats: dayChanged ? state.dayStats : {},
        preferences:
          local.preferences.updatedAt > local.since &&
          local.preferences.updatedAt >= mergedPreferences.updatedAt
            ? redactPreferences(local.preferences)
            : null,
      };
    });
  }

  private captureLocalChanges(): LocalChanges {
    const pending = this.store.pendingChanges();
    const fingerprints = <T extends BaseRecord>(list: T[]): Map<string, string> =>
      new Map(list.map((record) => [record.id, String(record.updatedAt)]));
    const dayStats = new Map<string, string>();
    for (const [date, stats] of Object.entries(pending.dayStats)) {
      dayStats.set(date, String(stats.updatedAt));
    }

    return {
      since: pending.since,
      blocks: fingerprints(pending.blocks),
      tasks: fingerprints(pending.tasks),
      notes: fingerprints(pending.notes),
      deadlines: fingerprints(pending.deadlines),
      profile: pending.profile ? String(pending.profile.updatedAt) : null,
      layout: pending.layout ? String(pending.layout.updatedAt) : null,
      appSettings: pending.settings ? String(pending.settings.updatedAt) : null,
      dayStats,
      preferences: this.settings.get(),
    };
  }

  private handleAuth(account: SyncAccount | null): void {
    const previous = this.state.account;

    if (!account) {
      this.clearTimer();
      this.setState({
        account: null,
        status: 'signed-out',
        pending: this.computePending(),
        error: null,
      });
      return;
    }

    if (this.lastUid !== null && this.lastUid !== account.uid) {
      // Never upload the previous account's history to a new account on a
      // shared device. Local records stay on disk and are merged with whatever
      // this account already has; only edits made from now on are pushed.
      this.quiet(() => this.store.markSynced(this.clock.nowISO()));
    }
    this.rememberUid(account.uid);

    this.setState({
      account,
      status: this.running ? 'syncing' : this.isOnline() ? 'idle' : 'offline',
      pending: this.computePending(),
      error: null,
    });

    if (!previous || previous.uid !== account.uid) {
      if (this.active) this.queued = true;
      void this.syncNow();
    }
  }

  private handleAdapterError(error: unknown): void {
    this.setState({
      status: this.isOnline() ? 'error' : 'offline',
      error: isOfflineError(error) ? null : errorMessage(error),
    });
  }

  private handleOnlineChange(): void {
    if (!this.isOnline()) {
      if (this.state.account) this.setState({ status: 'offline' });
      return;
    }
    if (this.state.account) void this.syncNow();
  }

  private handleLocalChange(): void {
    if (this.mergingRemote) return;
    if (this.pushing) this.localChangeDuringSync = true;

    const pending = this.computePending();
    if (pending !== this.state.pending) this.setState({ pending });

    if (!this.running && pending) this.scheduleSync();
  }

  private scheduleSync(): void {
    if (this.autoSyncMs === null || this.timer) return;
    if (!this.adapter || !this.state.account) return;
    if (!this.isOnline()) {
      this.setState({ status: 'offline' });
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, this.autoSyncMs);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private readLastUid(): string | null {
    if (!this.storage) return null;
    try {
      const value = this.storage.getItem(SYNC_ACCOUNT_KEY);
      return value && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  }

  private rememberUid(uid: string): void {
    this.lastUid = uid;
    if (!this.storage) return;
    try {
      this.storage.setItem(SYNC_ACCOUNT_KEY, uid);
    } catch {
      // remember in memory only
    }
  }

  private computePending(): boolean {
    const pending = this.store.pendingChanges();
    if (
      pending.blocks.length > 0 ||
      pending.tasks.length > 0 ||
      pending.notes.length > 0 ||
      pending.deadlines.length > 0 ||
      pending.profile !== null ||
      pending.layout !== null ||
      pending.settings !== null ||
      Object.keys(pending.dayStats).length > 0
    ) {
      return true;
    }
    return hasPendingPreferences(this.settings.get(), pending.since);
  }

  private quiet<T>(fn: () => T): T {
    const previous = this.mergingRemote;
    this.mergingRemote = true;
    try {
      return fn();
    } finally {
      this.mergingRemote = previous;
    }
  }

  private setState(patch: Partial<SyncState>): void {
    const next: SyncState = { ...this.state, ...patch };
    if (sameState(this.state, next)) return;
    this.state = next;
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch {
        // ignore subscriber errors
      }
    }
  }
}

export type { SyncStatus };

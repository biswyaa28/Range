import { describe, expect, it } from 'vitest';
import { addDays, FixedClock } from '@/domain/dates';
import { DAY_MS, TOMBSTONE_TTL_DAYS, tombstoneExpiresAt, withTombstoneExpiry } from '@/domain/tombstone';
import type { Task } from '@/domain/types';
import { PersonalStore } from '@/store/store';
import { SettingsStore } from '@/store/settingsStore';
import { SyncEngine, SYNC_CURSOR_SCHEMA } from '@/sync/engine';
import { SyncStateStore, pushLedgerKey } from '@/store/syncState';
import { planMissingRemoteTombstones, pruneLedger } from '@/sync/reconcile';
import type {
  RemoteSnapshot,
  SyncAccount,
  SyncAdapter,
  SyncPullOptions,
} from '@/sync/types';
import { MemoryStorage } from './memoryStorage';

const ACCOUNT: SyncAccount = {
  uid: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada',
  photoURL: null,
};

const NOW = '2026-04-13T10:00:00.000Z';

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    due: null,
    priority: 'med',
    done: false,
    category: '',
    createdAt: NOW,
    updatedAt: NOW,
    deleted: false,
    deviceId: 'device-a',
    ...patch,
  };
}

/** A stand-in for Firestore's `Timestamp` type. */
const fakeTimestamp = {
  fromDate(date: Date) {
    return { __timestamp: date.toISOString() };
  },
};

describe('the tombstone expiry timestamp', () => {
  it('is written on a soft-deleted record', () => {
    const stamped = withTombstoneExpiry(
      { id: 'task-1', deleted: true, updatedAt: NOW },
      fakeTimestamp,
    ) as { expireAt?: { __timestamp: string } };

    expect(stamped.expireAt?.__timestamp).toBe(
      new Date(Date.parse(NOW) + TOMBSTONE_TTL_DAYS * DAY_MS).toISOString(),
    );
  });

  it('is not written on a live record', () => {
    const stamped = withTombstoneExpiry(
      { id: 'task-1', deleted: false, updatedAt: NOW },
      fakeTimestamp,
    );

    expect('expireAt' in stamped).toBe(false);
  });

  it('is not written when the stamp cannot be read', () => {
    const stamped = withTombstoneExpiry(
      { id: 'task-1', deleted: true, updatedAt: 'not-a-date' },
      fakeTimestamp,
    );

    expect('expireAt' in stamped).toBe(false);
  });

  it('expires a tombstone after the retention span', () => {
    expect(tombstoneExpiresAt(NOW)).toBe(Date.parse(NOW) + TOMBSTONE_TTL_DAYS * DAY_MS);
  });
});

describe('the local tombstone cleanup', () => {
  function storeWithTasks(tasks: Task[], syncedAt: string): PersonalStore {
    const store = new PersonalStore({
      storage: new MemoryStorage(),
      clock: new FixedClock(NOW),
      debounceMs: 0,
    });
    store.set((state) => {
      state.tasks.push(...tasks);
      state.syncedAt = syncedAt;
    });
    return store;
  }

  it('removes a tombstone that was pushed and has aged out', () => {
    const old = new Date(Date.parse(NOW) - (TOMBSTONE_TTL_DAYS + 1) * DAY_MS).toISOString();
    const store = storeWithTasks(
      [task('gone', { deleted: true, updatedAt: old })],
      NOW,
    );

    const removed = store.gcExpiredTombstones(NOW);

    expect(removed).toBe(1);
    expect(store.get().tasks).toHaveLength(0);
  });

  it('keeps a tombstone that was never pushed', () => {
    const old = new Date(Date.parse(NOW) - (TOMBSTONE_TTL_DAYS + 1) * DAY_MS).toISOString();
    // The last sync happened before the delete, so the tombstone is still
    // the only record of it.
    const syncedBefore = new Date(Date.parse(old) - DAY_MS).toISOString();
    const store = storeWithTasks([task('gone', { deleted: true, updatedAt: old })], syncedBefore);

    expect(store.gcExpiredTombstones(NOW)).toBe(0);
    expect(store.get().tasks).toHaveLength(1);
  });

  it('keeps a tombstone that is still inside the retention span', () => {
    const recent = new Date(Date.parse(NOW) - 10 * DAY_MS).toISOString();
    const store = storeWithTasks([task('gone', { deleted: true, updatedAt: recent })], NOW);

    expect(store.gcExpiredTombstones(NOW)).toBe(0);
    expect(store.get().tasks).toHaveLength(1);
  });

  it('keeps a live record of any age', () => {
    const old = new Date(Date.parse(NOW) - 365 * DAY_MS).toISOString();
    const store = storeWithTasks([task('alive', { updatedAt: old })], NOW);

    expect(store.gcExpiredTombstones(NOW)).toBe(0);
    expect(store.get().tasks).toHaveLength(1);
  });
});

describe('records the remote dropped', () => {
  const ledger = { [pushLedgerKey('tasks', 'task-1')]: NOW };

  function input(patch: Partial<Parameters<typeof planMissingRemoteTombstones>[0]> = {}) {
    return {
      local: { blocks: [], tasks: [task('task-1')], notes: [], deadlines: [], habits: [] },
      remoteIds: { blocks: new Set<string>(), tasks: new Set<string>(), notes: new Set<string>(), deadlines: new Set<string>(), habits: new Set<string>() },
      pendingIds: { blocks: new Set<string>(), tasks: new Set<string>(), notes: new Set<string>(), deadlines: new Set<string>(), habits: new Set<string>() },
      ledger,
      ...patch,
    };
  }

  it('tombstones an uploaded record the remote no longer has', () => {
    const result = planMissingRemoteTombstones(input());

    expect(result.tombstones).toEqual([{ collection: 'tasks', id: 'task-1' }]);
  });

  it('keeps a record the remote still has', () => {
    const result = planMissingRemoteTombstones(
      input({
        remoteIds: {
          blocks: new Set<string>(),
          tasks: new Set(['task-1']),
          notes: new Set<string>(),
          deadlines: new Set<string>(),
          habits: new Set<string>(),
        },
      }),
    );

    expect(result.tombstones).toEqual([]);
  });

  it('keeps a record that was edited on this device', () => {
    const result = planMissingRemoteTombstones(
      input({
        pendingIds: {
          blocks: new Set<string>(),
          tasks: new Set(['task-1']),
          notes: new Set<string>(),
          deadlines: new Set<string>(),
          habits: new Set<string>(),
        },
      }),
    );

    expect(result.tombstones).toEqual([]);
  });

  it('keeps a record the remote never confirmed', () => {
    const result = planMissingRemoteTombstones(input({ ledger: {} }));

    expect(result.tombstones).toEqual([]);
  });

  it('drops ledger entries for records that no longer exist locally', () => {
    const result = planMissingRemoteTombstones(
      input({ ledger: { ...ledger, [pushLedgerKey('tasks', 'deleted-long-ago')]: NOW } }),
    );

    expect(result.ledger).toEqual(ledger);
  });

  it('keeps the ledger proportional to the records on the device', () => {
    const pruned = pruneLedger(
      {
        [pushLedgerKey('tasks', 'task-1')]: NOW,
        [pushLedgerKey('tasks', 'deleted-long-ago')]: NOW,
        [pushLedgerKey('notes', 'note-1')]: NOW,
      },
      { blocks: [], tasks: [task('task-1')], notes: [], deadlines: [], habits: [] },
    );

    expect(pruned).toEqual({ [pushLedgerKey('tasks', 'task-1')]: NOW });
  });
});

class EmptyAdapter implements SyncAdapter {
  readonly kind = 'test';
  pullOptions: Array<SyncPullOptions | undefined> = [];
  snapshot: RemoteSnapshot = {
    blocks: [],
    tasks: [],
    notes: [],
    deadlines: [],
    habits: [],
    profile: null,
    layout: null,
    appSettings: null,
    dayStats: null,
    preferences: null,
  };
  private listeners = new Set<(account: SyncAccount | null) => void>();

  subscribeAuth(listener: (account: SyncAccount | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  signInWithGoogle(): Promise<void> {
    return Promise.resolve();
  }

  signOut(): Promise<void> {
    return Promise.resolve();
  }

  emit(account: SyncAccount | null): void {
    for (const listener of this.listeners) listener(account);
  }

  async pull(_account: SyncAccount, options?: SyncPullOptions): Promise<RemoteSnapshot> {
    this.pullOptions.push(options);
    return this.snapshot;
  }

  async push(): Promise<void> {
    // Nothing to do.
  }
}

describe('a pull after more than the tombstone retention span', () => {
  it('does not resurrect a record the remote dropped', async () => {
    const clock = new FixedClock(NOW);
    const store = new PersonalStore({
      storage: new MemoryStorage(),
      clock,
      debounceMs: 0,
    });
    const settings = new SettingsStore({
      storage: new MemoryStorage(),
      clock,
      legacyKey: null,
      debounceMs: 0,
    });
    const adapter = new EmptyAdapter();
    const storage = new MemoryStorage();
    const engine = new SyncEngine({
      adapter,
      store,
      settings,
      storage,
      clock,
      isOnline: () => true,
      onlineSubscription: () => () => undefined,
      autoSyncMs: null,
    });

    // A record this device uploaded a while ago.
    store.set((state) => {
      state.tasks.push(task('task-1', { updatedAt: addDays(NOW.slice(0, 10), -80) + 'T10:00:00.000Z' }));
      state.syncedAt = addDays(NOW.slice(0, 10), -70) + 'T10:00:00.000Z';
    });
    const syncState = new SyncStateStore(storage);
    syncState.writeLedger({ [pushLedgerKey('tasks', 'task-1')]: store.get().tasks[0]?.updatedAt ?? NOW });
    // The device was away for longer than the remote keeps tombstones.
    syncState.writeCursor({
      schema: SYNC_CURSOR_SCHEMA,
      accountUid: ACCOUNT.uid,
      lastPullAt: addDays(NOW.slice(0, 10), -100) + 'T10:00:00.000Z',
      lastFullPullAt: addDays(NOW.slice(0, 10), -100) + 'T10:00:00.000Z',
    });

    engine.start();
    adapter.emit(ACCOUNT);
    await engine.syncNow();

    expect(adapter.pullOptions[0]).toMatchObject({ since: null, resume: undefined });
    expect(store.get().tasks[0]?.deleted).toBe(true);
    engine.dispose();
  });

  it('keeps a record that was edited here instead', async () => {
    const clock = new FixedClock(NOW);
    const store = new PersonalStore({
      storage: new MemoryStorage(),
      clock,
      debounceMs: 0,
    });
    const settings = new SettingsStore({
      storage: new MemoryStorage(),
      clock,
      legacyKey: null,
      debounceMs: 0,
    });
    const adapter = new EmptyAdapter();
    const storage = new MemoryStorage();
    const engine = new SyncEngine({
      adapter,
      store,
      settings,
      storage,
      clock,
      isOnline: () => true,
      onlineSubscription: () => () => undefined,
      autoSyncMs: null,
    });

    store.set((state) => {
      state.tasks.push(task('task-1', { updatedAt: addDays(NOW.slice(0, 10), -80) + 'T10:00:00.000Z' }));
      state.syncedAt = addDays(NOW.slice(0, 10), -90) + 'T10:00:00.000Z';
    });
    const syncState = new SyncStateStore(storage);
    syncState.writeLedger({ [pushLedgerKey('tasks', 'task-1')]: addDays(NOW.slice(0, 10), -80) + 'T10:00:00.000Z' });
    syncState.writeCursor({
      schema: SYNC_CURSOR_SCHEMA,
      accountUid: ACCOUNT.uid,
      lastPullAt: addDays(NOW.slice(0, 10), -100) + 'T10:00:00.000Z',
      lastFullPullAt: addDays(NOW.slice(0, 10), -100) + 'T10:00:00.000Z',
    });

    // A local edit that happened after the upload.
    store.set((state) => {
      const record = state.tasks[0];
      if (record) {
        record.title = 'Edited here';
        record.updatedAt = NOW;
      }
    });

    engine.start();
    adapter.emit(ACCOUNT);
    await engine.syncNow();

    expect(store.get().tasks[0]?.deleted).toBe(false);
    engine.dispose();
  });
});

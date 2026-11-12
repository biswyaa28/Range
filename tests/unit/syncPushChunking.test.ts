import { describe, expect, it } from 'vitest';
import { FixedClock } from '@/domain/dates';
import { PersonalStore } from '@/store/store';
import { SettingsStore } from '@/store/settingsStore';
import { SyncEngine } from '@/sync/engine';
import { planPushBatches } from '@/sync/batching';
import type {
  RemoteSnapshot,
  SyncAccount,
  SyncAdapter,
  SyncPush,
  SyncPushOptions,
} from '@/sync/types';
import { MemoryStorage } from './memoryStorage';

const ACCOUNT: SyncAccount = {
  uid: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada',
  photoURL: null,
};

const RECORD_COUNT = 1300;

/** An adapter that chunks like the Firebase one and can fail a batch. */
class ChunkedAdapter implements SyncAdapter {
  readonly kind = 'test';
  /** The record ids of every batch that was sent, per attempt. */
  batches: string[][] = [];
  /** The record ids that were accepted by the remote. */
  committed: string[] = [];
  /** 1-based index of the batch that fails; null never fails. */
  failOnBatch: number | null = null;
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

  async pull(): Promise<RemoteSnapshot> {
    return {
      blocks: [],
      tasks: [],
      notes: [],
      deadlines: [],
      profile: null,
      layout: null,
      appSettings: null,
      dayStats: null,
      preferences: null,
    };
  }

  async push(
    _account: SyncAccount,
    changes: SyncPush,
    options: SyncPushOptions = {},
  ): Promise<void> {
    for (const chunk of planPushBatches(changes)) {
      const ids = chunk.records.tasks.map((record) => record.id);
      this.batches.push(ids);
      if (this.failOnBatch !== null && this.batches.length === this.failOnBatch) {
        throw new Error('the remote refused the batch');
      }
      this.committed.push(...ids);
      options.onChunkCommitted?.(chunk);
    }
  }
}

function setup() {
  const clock = new FixedClock('2026-04-13T10:00:00.000Z');
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
  const adapter = new ChunkedAdapter();
  const engine = new SyncEngine({
    adapter,
    store,
    settings,
    storage: new MemoryStorage(),
    clock,
    isOnline: () => true,
    onlineSubscription: () => () => undefined,
    autoSyncMs: null,
  });

  return { clock, store, settings, adapter, engine };
}

function addTasks(store: PersonalStore, count: number, clock: FixedClock): void {
  const stamp = clock.nowISO();
  store.set((state) => {
    for (let index = 0; index < count; index += 1) {
      state.tasks.push({
        id: `task-${index}`,
        title: `Task ${index}`,
        due: null,
        priority: 'med',
        done: false,
        category: '',
        createdAt: stamp,
        updatedAt: stamp,
        deleted: false,
        deviceId: state.deviceId,
      });
    }
  });
}

describe('a push that spans several batches', () => {
  it('splits 1300 pending records into four batches', async () => {
    const { store, adapter, engine, clock } = setup();
    addTasks(store, RECORD_COUNT, clock);

    engine.start();
    adapter.emit(ACCOUNT);
    await engine.syncNow();

    expect(adapter.batches).toHaveLength(4);
    expect(adapter.committed).toHaveLength(RECORD_COUNT);
    engine.dispose();
  });

  it('keeps the committed batches and retries only the rest', async () => {
    const { store, adapter, engine, clock } = setup();

    engine.start();
    adapter.emit(ACCOUNT);
    await engine.syncNow();

    // A batch of pending records, newer than the last successful sync.
    clock.advanceMs(60_000);
    addTasks(store, RECORD_COUNT, clock);
    const syncedBefore = store.get().syncedAt;

    // The first batch commits, the second one fails.
    adapter.failOnBatch = 2;
    await engine.syncNow();

    expect(adapter.batches).toHaveLength(2);
    expect(adapter.committed).toHaveLength(400);
    // Nothing is marked as synced while the push is incomplete.
    expect(store.get().syncedAt).toBe(syncedBefore);
    expect(engine.getState().pending).toBe(true);

    // The retry skips the batch that already landed.
    adapter.failOnBatch = null;
    adapter.batches = [];
    const alreadySent = new Set(adapter.committed);
    await engine.syncNow();

    const retried = adapter.batches.flat();
    expect(retried.length).toBe(RECORD_COUNT - 400);
    for (const id of retried) {
      expect(alreadySent.has(id)).toBe(false);
    }
    expect(engine.getState().pending).toBe(false);
    engine.dispose();
  });
});

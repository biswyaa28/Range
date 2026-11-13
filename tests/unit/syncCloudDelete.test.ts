import { describe, it, expect } from 'vitest';
import { FixedClock } from '@/domain/dates';
import { PersonalStore } from '@/store/store';
import { SettingsStore } from '@/store/settingsStore';
import { SyncEngine } from '@/sync/engine';
import type {
  DeleteProgress,
  RemoteSnapshot,
  SyncAccount,
  SyncAdapter,
  SyncPush,
} from '@/sync/types';
import { MemoryStorage } from './memoryStorage';

const ACCOUNT: SyncAccount = {
  uid: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada',
  photoURL: null,
};

function emptySnapshot(): RemoteSnapshot {
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

class DeleteAdapter implements SyncAdapter {
  readonly kind = 'mock';
  deletedAccount: SyncAccount | null = null;
  signOuts = 0;
  progress: DeleteProgress[] = [];
  failure: Error | null = null;

  private listeners = new Set<(account: SyncAccount | null) => void>();

  subscribeAuth(listener: (account: SyncAccount | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(account: SyncAccount | null): void {
    for (const listener of this.listeners) listener(account);
  }

  async signInWithGoogle(): Promise<void> {
    this.emit(ACCOUNT);
  }

  async signOut(): Promise<void> {
    this.signOuts += 1;
    this.emit(null);
  }

  async pull(): Promise<RemoteSnapshot> {
    return emptySnapshot();
  }

  async push(_account: SyncAccount, _changes: SyncPush): Promise<void> {}

  async deleteAllData(
    account: SyncAccount,
    options?: { onProgress?: (progress: DeleteProgress) => void },
  ): Promise<void> {
    this.deletedAccount = account;
    if (this.failure) throw this.failure;
    options?.onProgress?.({ deleted: 0, total: 3 });
    options?.onProgress?.({ deleted: 3, total: 3 });
    this.progress.push({ deleted: 3, total: 3 });
  }
}

function setup() {
  const clock = new FixedClock('2026-04-13T10:00:00.000Z');
  const store = new PersonalStore({ storage: new MemoryStorage(), clock, debounceMs: 0 });
  const settings = new SettingsStore({
    storage: new MemoryStorage(),
    clock,
    legacyKey: null,
    debounceMs: 0,
  });
  const adapter = new DeleteAdapter();
  const engine = new SyncEngine({
    adapter,
    store,
    settings,
    storage: new MemoryStorage(),
    clock,
    isOnline: () => true,
    onlineSubscription: () => () => {},
    autoSyncMs: null,
  });
  return { clock, store, settings, adapter, engine };
}

async function signIn(adapter: DeleteAdapter, engine: SyncEngine): Promise<void> {
  engine.start();
  adapter.emit(ACCOUNT);
  await engine.syncNow();
}

describe('syncEngine.deleteCloudData', () => {
  it('deletes the remote copy, clears local data and signs out', async () => {
    const { store, adapter, engine } = setup();
    await signIn(adapter, engine);

    store.set((state) => {
      state.tasks.push({
        id: 'task-1',
        title: 'Keep me',
        due: null,
        priority: 'med',
        done: false,
        category: '',
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        deleted: false,
        deviceId: state.deviceId,
      });
    });

    const progress: DeleteProgress[] = [];
    await engine.deleteCloudData((entry) => progress.push(entry));

    expect(adapter.deletedAccount).toEqual(ACCOUNT);
    expect(progress).toEqual([
      { deleted: 0, total: 3 },
      { deleted: 3, total: 3 },
    ]);
    expect(store.get().tasks).toHaveLength(0);
    expect(typeof store.get().clearedAt).toBe('string');
    expect(adapter.signOuts).toBe(1);
    expect(engine.getState().account).toBeNull();
    expect(engine.getState().status).toBe('signed-out');
  });

  it('keeps local data and reports the error when the remote delete fails', async () => {
    const { store, adapter, engine } = setup();
    await signIn(adapter, engine);

    store.set((state) => {
      state.notes.push({
        id: 'note-1',
        title: 'Local',
        body: 'still here',
        pinned: false,
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        deleted: false,
        deviceId: state.deviceId,
      });
    });
    adapter.failure = new Error('permission-denied');

    await expect(engine.deleteCloudData()).rejects.toThrow('permission-denied');
    expect(store.get().notes).toHaveLength(1);
    expect(adapter.signOuts).toBe(0);
    expect(engine.getState().status).toBe('error');
    expect(engine.getState().error).toContain('permission-denied');
  });

  it('refuses when no account is signed in', async () => {
    const { engine } = setup();
    await expect(engine.deleteCloudData()).rejects.toThrow('Sign in');
  });
});

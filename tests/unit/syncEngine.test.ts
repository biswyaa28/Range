import { describe, it, expect, vi } from 'vitest';
import { FixedClock } from '@/domain/dates';
import { defaultSettings } from '@/domain/settings';
import type { Task } from '@/domain/types';
import { PersonalStore } from '@/store/store';
import { SettingsStore } from '@/store/settingsStore';
import { SyncEngine, SYNC_CURSOR_SCHEMA } from '@/sync/engine';
import { mergePreferences, redactPreferences } from '@/sync/preferences';
import { SyncStateStore } from '@/store/syncState';
import type {
  RemoteSnapshot,
  SyncAccount,
  SyncAdapter,
  SyncPullOptions,
  SyncPush,
} from '@/sync/types';
import { MemoryStorage } from './memoryStorage';

const ACCOUNT: SyncAccount = {
  uid: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada',
  photoURL: null,
};

const ACCOUNT_B: SyncAccount = {
  uid: 'user-2',
  email: 'grace@example.com',
  displayName: 'Grace',
  photoURL: null,
};

function emptySnapshot(): RemoteSnapshot {
  return {
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
}

function remoteTask(id: string, title: string, updatedAt: string, deleted = false) {
  return {
    id,
    title,
    due: null,
    priority: 'med',
    done: false,
    category: '',
    createdAt: '2026-04-13T08:00:00.000Z',
    updatedAt,
    deleted,
    deviceId: 'remote-device',
  };
}

class MockAdapter implements SyncAdapter {
  readonly kind = 'mock';
  snapshot: RemoteSnapshot = emptySnapshot();
  pushes: SyncPush[] = [];
  pullCount = 0;
  pushCount = 0;
  pullError: unknown = null;
  pushError: unknown = null;
  pullGate: Promise<void> | null = null;
  pushGate: Promise<void> | null = null;
  pullOptions: Array<SyncPullOptions | undefined> = [];

  private listeners = new Set<(account: SyncAccount | null) => void>();

  subscribeAuth(
    listener: (account: SyncAccount | null) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(account: SyncAccount | null): void {
    for (const listener of this.listeners) listener(account);
  }

  async signInWithGoogle(): Promise<void> {
    this.emit(ACCOUNT);
  }

  async signOut(): Promise<void> {
    this.emit(null);
  }

  async pull(_account: SyncAccount, options?: SyncPullOptions): Promise<RemoteSnapshot> {
    this.pullCount++;
    this.pullOptions.push(options);
    if (this.pullGate) await this.pullGate;
    if (this.pullError) throw this.pullError;
    return this.snapshot;
  }

  async push(_account: SyncAccount, changes: SyncPush): Promise<void> {
    this.pushCount++;
    if (this.pushGate) await this.pushGate;
    if (this.pushError) throw this.pushError;
    this.pushes.push(JSON.parse(JSON.stringify(changes)) as SyncPush);
  }
}

interface SetupOptions {
  online?: boolean;
}

function setup(options: SetupOptions = {}) {
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
  const accountStorage = new MemoryStorage();
  const adapter = new MockAdapter();
  let online = options.online ?? true;
  const onlineListeners: Array<() => void> = [];

  const engine = new SyncEngine({
    adapter,
    store,
    settings,
    storage: accountStorage,
    clock,
    isOnline: () => online,
    onlineSubscription: (listener) => {
      onlineListeners.push(listener);
      return () => {
        const index = onlineListeners.indexOf(listener);
        if (index >= 0) onlineListeners.splice(index, 1);
      };
    },
    autoSyncMs: null,
  });

  return {
    clock,
    store,
    settings,
    adapter,
    engine,
    accountStorage,
    setOnline(next: boolean) {
      online = next;
      for (const listener of onlineListeners) listener();
    },
    async signIn(account: SyncAccount = ACCOUNT) {
      engine.start();
      adapter.emit(account);
      await engine.syncNow();
    },
  };
}

function addTask(
  store: PersonalStore,
  clock: FixedClock,
  id: string,
  title: string,
  updatedAt = clock.nowISO(),
): void {
  store.set((state) => {
    const task: Task = {
      id,
      title,
      due: null,
      priority: 'med',
      done: false,
      category: '',
      createdAt: updatedAt,
      updatedAt,
      deleted: false,
      deviceId: state.deviceId,
    };
    state.tasks.push(task);
  });
}

describe('SyncEngine with a mocked adapter', () => {
  it('pulls, merges and pushes local changes on sign in', async () => {
    const { store, clock, adapter, engine, signIn } = setup();
    addTask(store, clock, 'local-1', 'Local task');
    adapter.snapshot.tasks = [
      remoteTask('remote-1', 'Remote task', '2026-04-13T09:00:00.000Z'),
    ];

    await signIn();

    expect(store.get().tasks.map((task) => task.id).sort()).toEqual([
      'local-1',
      'remote-1',
    ]);
    expect(adapter.pushes).toHaveLength(1);
    expect(adapter.pushes[0]?.tasks.map((task) => task.id)).toEqual(['local-1']);
    expect(engine.getState()).toMatchObject({
      status: 'idle',
      pending: false,
      account: ACCOUNT,
      lastSyncedAt: '2026-04-13T10:00:00.000Z',
      error: null,
    });
    expect(store.get().syncedAt).toBe('2026-04-13T10:00:00.000Z');
    engine.dispose();
  });

  it('merges newer remote preferences but never carries an AI key', async () => {
    const { store, settings, clock, adapter, engine, signIn } = setup();
    addTask(store, clock, 'local-1', 'Local task');
    settings.set({ theme: 'light' });

    const localPreferences = redactPreferences(settings.get());
    expect(localPreferences.ai).not.toHaveProperty('apiKey');
    adapter.snapshot.preferences = {
      ...localPreferences,
      theme: 'dark',
      updatedAt: '2026-04-13T10:05:00.000Z',
      ai: { ...localPreferences.ai, apiKey: 'remote-secret' },
    };

    await signIn();

    expect(settings.get().theme).toBe('dark');
    expect(settings.get().updatedAt).toBe('2026-04-13T10:05:00.000Z');
    // Normalization strips a stray key instead of adopting it.
    expect(settings.get().ai).not.toHaveProperty('apiKey');
    // Remote values are not echoed back as if they were local edits.
    expect(adapter.pushes[0]?.preferences).toBeNull();

    clock.advanceMs(10 * 60_000);
    settings.set({ identity: { name: 'Ada' } });
    await engine.syncNow();

    const pushed = adapter.pushes[1]?.preferences;
    expect(pushed).not.toBeNull();
    expect(pushed?.ai).not.toHaveProperty('apiKey');
    expect(JSON.stringify(pushed)).not.toContain('remote-secret');
    engine.dispose();
  });

  it('lets a newer local tombstone beat an older remote edit', async () => {
    const { store, clock, adapter, engine, signIn } = setup();
    addTask(store, clock, 'shared', 'Deleted locally');
    store.set((state) => {
      const task = state.tasks.find((entry) => entry.id === 'shared');
      if (task) {
        task.deleted = true;
        task.updatedAt = '2026-04-13T10:00:00.000Z';
      }
    });
    adapter.snapshot.tasks = [
      remoteTask('shared', 'Remote edit', '2026-04-13T09:00:00.000Z'),
    ];

    await signIn();

    const task = store.get().tasks.find((entry) => entry.id === 'shared');
    expect(task?.deleted).toBe(true);
    expect(task?.title).toBe('Deleted locally');
    expect(adapter.pushes[0]?.tasks[0]?.deleted).toBe(true);
    engine.dispose();
  });

  it('treats offline as a status and syncs when the connection returns', async () => {
    const { store, clock, adapter, engine, signIn, setOnline } = setup({
      online: false,
    });
    addTask(store, clock, 'local-1', 'Offline task');

    await signIn();

    expect(adapter.pullCount).toBe(0);
    expect(engine.getState()).toMatchObject({ status: 'offline', pending: true });
    expect(store.get().tasks).toHaveLength(1);

    setOnline(true);
    await engine.syncNow();

    expect(adapter.pullCount).toBe(1);
    expect(adapter.pushes[0]?.tasks.map((task) => task.id)).toEqual(['local-1']);
    expect(engine.getState()).toMatchObject({ status: 'idle', pending: false });
    engine.dispose();
  });

  it('reports an error, keeps pending changes and retries successfully', async () => {
    const { store, clock, adapter, engine, signIn } = setup();
    addTask(store, clock, 'local-1', 'Pending task');
    adapter.pullError = Object.assign(new Error('Boom'), { code: 'internal' });

    await signIn();

    expect(engine.getState()).toMatchObject({
      status: 'error',
      pending: true,
      error: 'Boom',
    });

    adapter.pullError = null;
    await engine.syncNow();

    expect(engine.getState()).toMatchObject({ status: 'idle', pending: false });
    expect(adapter.pushes[0]?.tasks).toHaveLength(1);
    engine.dispose();
  });

  it('stops contacting the adapter after sign out', async () => {
    const { adapter, engine, signIn } = setup();
    await signIn();
    expect(adapter.pullCount).toBe(1);

    await engine.signOut();

    expect(engine.getState()).toMatchObject({
      status: 'signed-out',
      account: null,
    });
    await engine.syncNow();
    expect(adapter.pullCount).toBe(1);
    engine.dispose();
  });

  it('does not upload the previous account history after an account switch', async () => {
    const { store, clock, adapter, engine, signIn } = setup();
    addTask(store, clock, 'task-1', 'Local first');
    await signIn();
    expect(adapter.pushes[0]?.tasks.map((task) => task.id)).toEqual(['task-1']);

    await engine.signOut();
    adapter.emit(ACCOUNT_B);
    await engine.syncNow();

    expect(engine.getState().account?.uid).toBe('user-2');
    expect(adapter.pushes).toHaveLength(2);
    expect(adapter.pushes[1]?.tasks).toEqual([]);
    engine.dispose();
  });

  it('queues the new account sync when auth changes during a pull', async () => {
    const { store, clock, adapter, engine } = setup();
    addTask(store, clock, 'task-1', 'Local first');
    engine.start();

    let release: () => void = () => undefined;
    adapter.pullGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    adapter.emit(ACCOUNT);
    expect(engine.getState().status).toBe('syncing');

    adapter.emit(ACCOUNT_B);
    adapter.pullGate = null;
    release();

    await vi.waitFor(() => {
      expect(engine.getState()).toMatchObject({ status: 'idle', pending: false });
    });
    expect(engine.getState().account?.uid).toBe('user-2');
    expect(adapter.pushes.flatMap((push) => push.tasks)).toEqual([]);
    engine.dispose();
  });

  it('keeps the account-switch reset when auth changes during a push', async () => {
    const { store, clock, adapter, engine } = setup();
    addTask(store, clock, 'task-1', 'Local first');
    engine.start();

    let release: () => void = () => undefined;
    adapter.pushGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    adapter.emit(ACCOUNT);
    await vi.waitFor(() => expect(adapter.pushCount).toBe(1));

    adapter.emit(ACCOUNT_B);
    adapter.pushGate = null;
    release();

    await vi.waitFor(() => {
      expect(engine.getState()).toMatchObject({ status: 'idle', pending: false });
    });
    expect(engine.getState().account?.uid).toBe('user-2');
    expect(adapter.pushes.map((push) => push.tasks.map((task) => task.id))).toEqual([
      ['task-1'],
      [],
    ]);
    engine.dispose();
  });

  it('pushes only records newer than the last successful cursor', async () => {
    const { store, clock, adapter, engine, signIn } = setup();
    addTask(store, clock, 'task-1', 'First');
    await signIn();

    clock.advanceMs(10_000);
    addTask(store, clock, 'task-2', 'Second', clock.nowISO());

    expect(engine.getState().pending).toBe(true);
    await engine.syncNow();

    expect(adapter.pushes).toHaveLength(2);
    expect(adapter.pushes[1]?.tasks.map((task) => task.id)).toEqual(['task-2']);
    expect(engine.getState()).toMatchObject({ status: 'idle', pending: false });
    engine.dispose();
  });

  it('pulls whole collections on the first sync', async () => {
    const { adapter, signIn } = setup();
    await signIn();

    expect(adapter.pullOptions[0]).toMatchObject({ since: null, resume: undefined });
  });

  it('pulls from slightly before the last pull cursor so clock skew cannot hide writes', async () => {
    const { adapter, accountStorage, signIn } = setup();
    // The pull cursor is device-local bookkeeping, separate from the push
    // cursor the app state keeps.
    new SyncStateStore(accountStorage).writeCursor({
      schema: SYNC_CURSOR_SCHEMA,
      accountUid: ACCOUNT.uid,
      lastPullAt: '2026-04-13T10:00:00.000Z',
      lastFullPullAt: '2026-04-13T10:00:00.000Z',
    });
    await signIn();

    expect(adapter.pullOptions[0]?.since).toBe('2026-04-13T09:50:00.000Z');
  });

  it('forces a full pull after an account switch', async () => {
    const { adapter, engine, store, signIn } = setup();
    await signIn(ACCOUNT);
    store.markSynced('2026-04-13T10:00:00.000Z');

    adapter.emit(ACCOUNT_B);
    await engine.syncNow();

    expect(adapter.pullOptions.at(-1)).toMatchObject({ since: null, resume: undefined });
    engine.dispose();
  });

  it('applies preference last-write-wins and ignores older remote values', () => {
    const local = {
      ...defaultSettings(),
      theme: 'dark' as const,
      updatedAt: '2026-04-13T10:00:00.000Z',
    };
    const older = {
      ...redactPreferences(local),
      theme: 'light',
      updatedAt: '2026-04-13T09:00:00.000Z',
    };

    expect(mergePreferences(local, older)).toBeNull();
    expect(
      mergePreferences(local, {
        ...older,
        updatedAt: '2026-04-13T11:00:00.000Z',
      })?.theme,
    ).toBe('light');
  });
});

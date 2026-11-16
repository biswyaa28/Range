import { describe, it, expect } from 'vitest';
import { FixedClock } from '@/domain/dates';
import { PersonalStore } from '@/store/store';
import { SettingsStore } from '@/store/settingsStore';
import { SyncEngine } from '@/sync/engine';
import { RECORD_MAX_BYTES } from '@/domain/limits';
import type {
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
    habits: [],
    profile: null,
    layout: null,
    appSettings: null,
    dayStats: null,
    preferences: null,
  };
}

class PushAdapter implements SyncAdapter {
  readonly kind = 'mock';
  pushes: SyncPush[] = [];
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
    this.emit(null);
  }

  async pull(): Promise<RemoteSnapshot> {
    return emptySnapshot();
  }

  async push(_account: SyncAccount, changes: SyncPush): Promise<void> {
    this.pushes.push(JSON.parse(JSON.stringify(changes)) as SyncPush);
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
  const adapter = new PushAdapter();
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
  return { store, adapter, engine };
}

describe('oversized records', () => {
  it('skips a 1.2 MB note but still syncs every other record', async () => {
    const { store, adapter, engine } = setup();
    engine.start();
    adapter.emit(ACCOUNT);
    await engine.syncNow();
    adapter.pushes.length = 0;

    store.set((state) => {
      state.tasks.push({
        id: 'task-1',
        title: 'Small task',
        due: null,
        priority: 'med',
        done: false,
        category: '',
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T11:00:00.000Z',
        deleted: false,
        deviceId: state.deviceId,
      });
      state.notes.push({
        id: 'note-huge',
        title: 'Huge note',
        body: 'x'.repeat(1_200_000),
        pinned: false,
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T11:00:00.000Z',
        deleted: false,
        deviceId: state.deviceId,
      });
    });

    await engine.syncNow();

    const pushed = adapter.pushes.flat();
    expect(pushed.some((push) => push.tasks.some((task) => task.id === 'task-1'))).toBe(true);
    expect(pushed.some((push) => push.notes.some((note) => note.id === 'note-huge'))).toBe(
      false,
    );

    const unsyncable = engine.getState().unsyncable ?? [];
    expect(unsyncable).toHaveLength(1);
    expect(unsyncable[0]).toMatchObject({
      collection: 'notes',
      id: 'note-huge',
      title: 'Huge note',
    });
    expect(unsyncable[0]?.bytes).toBeGreaterThan(RECORD_MAX_BYTES);
  });

  it('clears the unsyncable report once the record fits', async () => {
    const { store, adapter, engine } = setup();
    engine.start();
    adapter.emit(ACCOUNT);
    await engine.syncNow();

    store.set((state) => {
      state.notes.push({
        id: 'note-huge',
        title: 'Huge note',
        body: 'x'.repeat(1_200_000),
        pinned: false,
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T11:00:00.000Z',
        deleted: false,
        deviceId: state.deviceId,
      });
    });
    await engine.syncNow();
    expect(engine.getState().unsyncable).toHaveLength(1);

    store.set((state) => {
      const note = state.notes.find((entry) => entry.id === 'note-huge');
      if (note) {
        note.body = 'short';
        note.updatedAt = '2026-04-13T10:00:01.000Z';
      }
    });
    await engine.syncNow();

    expect(engine.getState().unsyncable).toHaveLength(0);
  });
});

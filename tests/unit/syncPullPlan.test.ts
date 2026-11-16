import { describe, expect, it } from 'vitest';
import { FixedClock } from '@/domain/dates';
import { PersonalStore } from '@/store/store';
import { SettingsStore } from '@/store/settingsStore';
import { SyncEngine, SYNC_CURSOR_SCHEMA } from '@/sync/engine';
import { SyncStateStore, type SyncCursor } from '@/store/syncState';
import {
  FULL_PULL_INTERVAL_MS,
  PULL_OVERLAP_MS,
  planPull,
  STALE_CURSOR_MS,
} from '@/sync/pullPlan';
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
const NOW_MS = Date.parse(NOW);

function cursor(overrides: Partial<SyncCursor> = {}): SyncCursor {
  return {
    schema: SYNC_CURSOR_SCHEMA,
    accountUid: ACCOUNT.uid,
    lastPullAt: NOW,
    lastFullPullAt: NOW,
    ...overrides,
  };
}

function iso(msAgo: number): string {
  return new Date(NOW_MS - msAgo).toISOString();
}

describe('planPull', () => {
  it('reads everything on the first sync', () => {
    expect(planPull(null, ACCOUNT.uid, NOW, SYNC_CURSOR_SCHEMA)).toEqual({
      since: null,
      full: true,
      reason: 'first-sync',
    });
  });

  it('reads everything after an account change', () => {
    const plan = planPull(cursor({ accountUid: 'someone-else' }), ACCOUNT.uid, NOW, 1);
    expect(plan).toMatchObject({ since: null, full: true, reason: 'account-change' });
  });

  it('reads everything after a schema migration', () => {
    const plan = planPull(cursor({ schema: 0 }), ACCOUNT.uid, NOW, 1);
    expect(plan).toMatchObject({ since: null, full: true, reason: 'schema-migration' });
  });

  it('reads everything when the cursor cannot be parsed', () => {
    const plan = planPull(cursor({ lastPullAt: 'not-a-date' }), ACCOUNT.uid, NOW, 1);
    expect(plan).toMatchObject({ since: null, full: true, reason: 'invalid-cursor' });
  });

  it('reads everything when the device was away for more than the stale span', () => {
    const plan = planPull(
      cursor({
        lastPullAt: iso(STALE_CURSOR_MS + 60_000),
        lastFullPullAt: iso(STALE_CURSOR_MS + 60_000),
      }),
      ACCOUNT.uid,
      NOW,
      1,
    );
    expect(plan).toMatchObject({ since: null, full: true, reason: 'stale-cursor' });
  });

  it('reads everything once a day', () => {
    const plan = planPull(
      cursor({
        lastPullAt: iso(60_000),
        lastFullPullAt: iso(FULL_PULL_INTERVAL_MS),
      }),
      ACCOUNT.uid,
      NOW,
      1,
    );
    expect(plan).toMatchObject({ since: null, full: true, reason: 'daily-full-pull' });
  });

  it('reads only what changed, from before the last pull', () => {
    const lastPullAt = iso(60_000);
    const plan = planPull(cursor({ lastPullAt }), ACCOUNT.uid, NOW, 1);

    expect(plan.full).toBe(false);
    expect(plan.reason).toBe('incremental');
    expect(plan.since).toBe(new Date(Date.parse(lastPullAt) - PULL_OVERLAP_MS).toISOString());
  });
});

class RecordingAdapter implements SyncAdapter {
  readonly kind = 'test';
  pullOptions: Array<SyncPullOptions | undefined> = [];
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

  async push(): Promise<void> {
    // Nothing to do.
  }
}

function setup() {
  const clock = new FixedClock(NOW);
  const store = new PersonalStore({ storage: new MemoryStorage(), clock, debounceMs: 0 });
  const settings = new SettingsStore({
    storage: new MemoryStorage(),
    clock,
    legacyKey: null,
    debounceMs: 0,
  });
  const adapter = new RecordingAdapter();
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

  return { clock, store, settings, adapter, engine, storage };
}

describe('the pull cursor', () => {
  it('is saved for the account so the next pull can read less', async () => {
    const { adapter, engine, storage, clock } = setup();

    engine.start();
    adapter.emit(ACCOUNT);
    await engine.syncNow();

    expect(adapter.pullOptions[0]).toMatchObject({ since: null, resume: undefined });

    clock.advanceMs(60_000);
    await engine.syncNow();

    const saved = new SyncStateStore(storage).readCursor(SYNC_CURSOR_SCHEMA);
    expect(saved?.accountUid).toBe(ACCOUNT.uid);
    expect(saved?.lastPullAt).toBe('2026-04-13T10:01:00.000Z');
    // The second pull starts ten minutes before the first one started, so a
    // write that landed while it ran is not skipped.
    expect(adapter.pullOptions.at(-1)?.since).toBe('2026-04-13T09:50:00.000Z');
    engine.dispose();
  });

  it('reads everything again once the cursor is a day old', async () => {
    const { adapter, engine, clock } = setup();

    engine.start();
    adapter.emit(ACCOUNT);
    await engine.syncNow();

    clock.advanceMs(FULL_PULL_INTERVAL_MS);
    await engine.syncNow();

    expect(adapter.pullOptions.at(-1)).toMatchObject({ since: null, resume: undefined });
    engine.dispose();
  });

  it('ignores a cursor written for another account', async () => {
    const { adapter, engine, storage } = setup();
    new SyncStateStore(storage).writeCursor(cursor({ accountUid: 'someone-else' }));

    engine.start();
    adapter.emit(ACCOUNT);
    await engine.syncNow();

    expect(adapter.pullOptions[0]).toMatchObject({ since: null, resume: undefined });
    engine.dispose();
  });
});

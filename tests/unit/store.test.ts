import { describe, it, expect, vi } from 'vitest';
import { PersonalStore } from '@/store/store';
import { MemoryStorage } from './memoryStorage';
import { FixedClock } from '@/domain/dates';
import { SequenceIdGen } from '@/domain/id';
import { STORAGE_KEY, BACKUP_KEY } from '@/domain/types';
import legacyV1Fixture from '../fixtures/legacy_v1_save.json';
import legacyExportFixture from '../fixtures/legacy_export.json';

describe('PersonalStore and persistence operations', () => {
  it('migrates from legacy v1 save without dropping records', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(legacyV1Fixture));

    const clock = new FixedClock('2026-04-13T10:00:00.000Z');
    const idGen = new SequenceIdGen('test-dev');
    const store = new PersonalStore({ storage, clock, idGen, debounceMs: 0 });

    const state = store.get();
    expect(state.schemaVersion).toBe(2);
    expect(state.deviceId).toBeTruthy();
    expect(state.blocks.length).toBe(2);
    expect(state.tasks.length).toBe(1);
    expect(state.notes.length).toBe(1);
    expect(state.deadlines.length).toBe(1);
    expect(state.blocks[0]?.id).toBe('blk-legacy-1');
    expect(state.blocks[0]?.createdAt).toBeTruthy();
    expect(state.blocks[0]?.updatedAt).toBeTruthy();
    expect(state.blocks[0]?.deleted).toBe(false);
    expect(state.dayStats['2026-04-06']?.blocksDone).toBe(1);
  });

  it('migrates from current schema 2 fixture intact', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(legacyExportFixture));

    const store = new PersonalStore({ storage, debounceMs: 0 });
    const state = store.get();

    expect(state.schemaVersion).toBe(2);
    expect(state.profile.name).toBe('Biswajeet');
    expect(state.blocks[0]?.title).toBe('Discrete Math');
    expect(state.tasks[0]?.title).toBe('Email TA');
  });

  it('handles soft-delete, undelete and updatedAt timestamp updates', () => {
    const storage = new MemoryStorage();
    const clock = new FixedClock('2026-04-13T10:00:00.000Z');
    const store = new PersonalStore({ storage, clock, debounceMs: 0 });

    store.set((s) => {
      s.tasks.push({
        id: 't-1',
        title: 'Task 1',
        due: null,
        priority: 'med',
        done: false,
        category: '',
        createdAt: clock.nowISO(),
        updatedAt: clock.nowISO(),
        deleted: false,
        deviceId: s.deviceId,
      });
    });

    clock.advanceMs(5000);
    store.set((s) => {
      const task = s.tasks.find((t) => t.id === 't-1');
      if (task) {
        task.deleted = true;
        task.updatedAt = clock.nowISO();
      }
    });

    const deletedTask = store.get().tasks.find((t) => t.id === 't-1');
    expect(deletedTask?.deleted).toBe(true);
    expect(deletedTask?.updatedAt).toBe('2026-04-13T10:00:05.000Z');

    clock.advanceMs(5000);
    store.set((s) => {
      const task = s.tasks.find((t) => t.id === 't-1');
      if (task) {
        task.deleted = false;
        task.updatedAt = clock.nowISO();
      }
    });

    const undeletedTask = store.get().tasks.find((t) => t.id === 't-1');
    expect(undeletedTask?.deleted).toBe(false);
    expect(undeletedTask?.updatedAt).toBe('2026-04-13T10:00:10.000Z');
  });

  it('executes mergeRemote resolution ladder (newer wins, older ignored, tombstone vs edit, idempotent)', () => {
    const storage = new MemoryStorage();
    const clock = new FixedClock('2026-04-13T10:00:00.000Z');
    const store = new PersonalStore({ storage, clock, debounceMs: 0 });

    store.set((s) => {
      s.tasks.push({
        id: 'task-sync-1',
        title: 'Local task title',
        due: null,
        priority: 'med',
        done: false,
        category: '',
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        deleted: false,
        deviceId: s.deviceId,
      });
    });

    // 1. Older remote edit is ignored
    const olderSummary = store.mergeRemote({
      tasks: [
        {
          id: 'task-sync-1',
          title: 'Older Remote Title',
          updatedAt: '2026-04-13T09:00:00.000Z',
        },
      ],
    });
    expect(olderSummary.ignored).toBe(1);
    expect(olderSummary.updated).toBe(0);
    expect(store.get().tasks[0]?.title).toBe('Local task title');

    // 2. Newer remote edit wins
    const newerSummary = store.mergeRemote({
      tasks: [
        {
          id: 'task-sync-1',
          title: 'Newer Remote Title',
          updatedAt: '2026-04-13T11:00:00.000Z',
        },
      ],
    });
    expect(newerSummary.updated).toBe(1);
    expect(store.get().tasks[0]?.title).toBe('Newer Remote Title');

    // 3. Newer tombstone wins over active edit
    const tombstoneSummary = store.mergeRemote({
      tasks: [
        {
          id: 'task-sync-1',
          deleted: true,
          updatedAt: '2026-04-13T12:00:00.000Z',
        },
      ],
    });
    expect(tombstoneSummary.deleted).toBe(1);
    expect(store.get().tasks[0]?.deleted).toBe(true);

    // 4. Older edit NEVER resurrects a deleted tombstone
    const resurrectAttempt = store.mergeRemote({
      tasks: [
        {
          id: 'task-sync-1',
          title: 'Resurrect attempt',
          deleted: false,
          updatedAt: '2026-04-13T11:30:00.000Z',
        },
      ],
    });
    expect(resurrectAttempt.ignored).toBe(1);
    expect(store.get().tasks[0]?.deleted).toBe(true);

    // 5. Add new record remotely
    const addSummary = store.mergeRemote({
      notes: [
        {
          id: 'note-rem-1',
          title: 'Remote Note',
          body: 'Hello',
          updatedAt: '2026-04-13T10:00:00.000Z',
        },
      ],
    });
    expect(addSummary.added).toBe(1);
    expect(store.get().notes.some((n) => n.id === 'note-rem-1')).toBe(true);

    // 6. Idempotency: re-applying exact same remote results in ignored
    const repeatSummary = store.mergeRemote({
      tasks: [
        {
          id: 'task-sync-1',
          deleted: true,
          updatedAt: '2026-04-13T12:00:00.000Z',
        },
      ],
    });
    expect(repeatSummary.ignored).toBe(1);
  });

  it('performs export and import round-trip cleanly', () => {
    const storage = new MemoryStorage();
    const store = new PersonalStore({ storage, debounceMs: 0 });

    store.set((s) => {
      s.profile.name = 'RoundTrip User';
      s.tasks.push({
        id: 't-rt',
        title: 'Exported task',
        due: null,
        priority: 'high',
        done: false,
        category: '',
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        deleted: false,
        deviceId: s.deviceId,
      });
    });

    const exported = store.exportAll();
    expect(exported.profile.name).toBe('RoundTrip User');
    expect(exported.tasks.length).toBe(1);

    const targetStorage = new MemoryStorage();
    const targetStore = new PersonalStore({ storage: targetStorage, debounceMs: 0 });
    targetStore.importAll(exported);

    expect(targetStore.get().profile.name).toBe('RoundTrip User');
    expect(targetStore.get().tasks[0]?.id).toBe('t-rt');
  });

  it('tracks pendingChanges and marks synced cursor', () => {
    const storage = new MemoryStorage();
    const clock = new FixedClock('2026-04-13T10:00:00.000Z');
    const store = new PersonalStore({ storage, clock, debounceMs: 0 });

    // Initial sync mark
    store.markSynced('2026-04-13T10:00:00.000Z');
    expect(store.pendingChanges().tasks.length).toBe(0);

    // Make local change
    clock.advanceMs(1000);
    store.set((s) => {
      s.tasks.push({
        id: 't-pending',
        title: 'Unsynced task',
        due: null,
        priority: 'med',
        done: false,
        category: '',
        createdAt: clock.nowISO(),
        updatedAt: clock.nowISO(),
        deleted: false,
        deviceId: s.deviceId,
      });
    });

    const pending = store.pendingChanges();
    expect(pending.tasks.length).toBe(1);
    expect(pending.tasks[0]?.id).toBe('t-pending');

    // Mark synced
    store.markSynced(clock.nowISO());
    expect(store.pendingChanges().tasks.length).toBe(0);
  });

  it('backs up corrupt save and starts with clean default state', () => {
    const storage = new MemoryStorage();
    const corruptJSON = '{ this is broken JSON! ]';
    storage.setItem(STORAGE_KEY, corruptJSON);

    const store = new PersonalStore({ storage, debounceMs: 0 });
    expect(store.get().schemaVersion).toBe(2);
    expect(store.get().blocks.length).toBe(0);

    // Corrupt string saved to backup key
    expect(storage.getItem(BACKUP_KEY)).toBe(corruptJSON);
  });

  it('notifies subscribers on mutation and flush', () => {
    const storage = new MemoryStorage();
    const store = new PersonalStore({ storage, debounceMs: 0 });

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set((s) => {
      s.profile.name = 'Alice';
    });

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.set((s) => {
      s.profile.name = 'Bob';
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});


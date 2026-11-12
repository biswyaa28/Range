import { describe, expect, it } from 'vitest';
import { defaultState, type Task } from '@/domain/types';
import { mergeRemote } from '@/store/merge';

function task(overrides: Partial<Task>): Task {
  return {
    id: 'task-1',
    title: 'Local',
    due: null,
    priority: 'med',
    done: false,
    category: '',
    createdAt: '2026-04-13T10:00:00.000Z',
    updatedAt: '2026-04-13T10:00:00.000Z',
    deleted: false,
    deviceId: 'device-a',
    ...overrides,
  };
}

describe('mergeRemote last-write-wins', () => {
  it('keeps the newer update regardless of device id', () => {
    const state = defaultState();
    state.deviceId = 'device-a';
    state.tasks = [task({ title: 'Local', updatedAt: '2026-04-13T10:00:00.000Z' })];

    mergeRemote(state, {
      tasks: [task({ title: 'Remote', updatedAt: '2026-04-13T10:00:01.000Z', deviceId: 'device-a' })],
    });

    expect(state.tasks[0]?.title).toBe('Remote');
  });

  it('breaks an equal-timestamp tie by device id so both devices converge', () => {
    const state = defaultState();
    state.deviceId = 'device-a';
    state.tasks = [task({ title: 'Local', deviceId: 'device-a' })];

    mergeRemote(state, { tasks: [task({ title: 'Remote', deviceId: 'device-b' })] });

    expect(state.tasks[0]?.title).toBe('Remote');
  });

  it('ignores a tied remote edit from a lower device id', () => {
    const state = defaultState();
    state.deviceId = 'device-z';
    state.tasks = [task({ title: 'Local', deviceId: 'device-z' })];

    mergeRemote(state, { tasks: [task({ title: 'Remote', deviceId: 'device-a' })] });

    expect(state.tasks[0]?.title).toBe('Local');
  });

  it('never resurrects a tombstone with an older edit', () => {
    const state = defaultState();
    state.tasks = [
      task({ title: 'Deleted', deleted: true, updatedAt: '2026-04-13T10:00:05.000Z' }),
    ];

    mergeRemote(state, {
      tasks: [task({ title: 'Edited', updatedAt: '2026-04-13T10:00:01.000Z' })],
    });

    expect(state.tasks[0]?.deleted).toBe(true);
    expect(state.tasks[0]?.title).toBe('Deleted');
  });
});

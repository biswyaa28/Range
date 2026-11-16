import { describe, expect, it } from 'vitest';
import { BACKUP_LIST_KEYS, validateBackupText } from '@/domain/backup';
import { defaultState, EPOCH_TS } from '@/domain/types';
import { hydrateState, migrateSave } from '@/store/migrate';
import { mergeRemote } from '@/store/merge';

const HABIT = {
  id: 'habit-1',
  title: 'Read',
  schedule: 'weekdays',
  checkins: ['2026-11-16', '2026-11-15', '2026-11-16'],
  reminder: '20:00',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  deleted: false,
  deviceId: 'device-1',
};

describe('habit persistence', () => {
  it('adds an empty habits list when loading an older save', () => {
    expect(hydrateState({ tasks: [] }).habits).toEqual([]);
  });

  it('normalizes habit fields during migration', () => {
    const state = migrateSave({
      habits: [{ ...HABIT, checkins: ['2026-11-16', '2026-11-16', 7], reminder: '8pm' }],
    });
    expect(state.habits[0]?.checkins).toEqual(['2026-11-16']);
    expect(state.habits[0]?.reminder).toBeNull();
    expect(state.habits[0]?.schedule).toBe('weekdays');
  });

  it('accepts a habits-only backup', () => {
    expect(BACKUP_LIST_KEYS).toContain('habits');
    expect(validateBackupText(JSON.stringify({ habits: [HABIT] })).ok).toBe(true);
  });

  it('merges new and newer habit records with LWW', () => {
    const state = defaultState();
    state.deviceId = 'local';
    mergeRemote(state, { habits: [HABIT] });
    expect(state.habits).toHaveLength(1);

    mergeRemote(state, {
      habits: [{ ...HABIT, title: 'Read more', updatedAt: '2026-11-02T10:00:00.000Z' }],
    });
    expect(state.habits[0]?.title).toBe('Read more');

    mergeRemote(state, {
      habits: [
        {
          ...HABIT,
          deleted: true,
          updatedAt: '2026-11-03T10:00:00.000Z',
          expireAt: EPOCH_TS,
        },
      ],
    });
    expect(state.habits[0]?.deleted).toBe(true);
  });
});

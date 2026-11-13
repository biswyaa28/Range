import { describe, it, expect } from 'vitest';
import { FixedClock } from '@/domain/dates';
import {
  NOTE_BODY_MAX_CHARS,
  clampAppStateNotes,
  clampNoteBody,
  countOversizedNotes,
} from '@/domain/limits';
import { defaultState } from '@/domain/types';
import { PersonalStore } from '@/store/store';
import { MemoryStorage } from './memoryStorage';

describe('note body limit', () => {
  it('truncates a body over 200,000 characters', () => {
    const body = 'x'.repeat(NOTE_BODY_MAX_CHARS + 10);
    expect(clampNoteBody(body)).toHaveLength(NOTE_BODY_MAX_CHARS);
    expect(clampNoteBody('short')).toBe('short');
  });

  it('truncates imported notes and reports how many changed', () => {
    const state = defaultState();
    state.notes = [
      {
        id: 'big',
        title: 'Big',
        body: 'x'.repeat(NOTE_BODY_MAX_CHARS + 10),
        pinned: false,
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        deleted: false,
        deviceId: 'device-1',
      },
      {
        id: 'small',
        title: 'Small',
        body: 'fine',
        pinned: false,
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        deleted: false,
        deviceId: 'device-1',
      },
    ];

    expect(clampAppStateNotes(state)).toBe(1);
    expect(state.notes[0]?.body).toHaveLength(NOTE_BODY_MAX_CHARS);
    expect(state.notes[1]?.body).toBe('fine');
  });

  it('clamps an imported backup through the store', () => {
    const store = new PersonalStore({
      storage: new MemoryStorage(),
      clock: new FixedClock('2026-04-13T10:00:00.000Z'),
      debounceMs: 0,
    });
    const incoming = defaultState();
    incoming.notes = [
      {
        id: 'big',
        title: 'Big',
        body: 'x'.repeat(NOTE_BODY_MAX_CHARS + 100),
        pinned: false,
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        deleted: false,
        deviceId: 'device-1',
      },
    ];

    store.importAll(incoming);
    expect(store.get().notes[0]?.body).toHaveLength(NOTE_BODY_MAX_CHARS);
  });

  it('counts oversized notes in a backup before import', () => {
    expect(
      countOversizedNotes({
        notes: [{ body: 'x'.repeat(NOTE_BODY_MAX_CHARS + 1) }, { body: 'small' }],
      }),
    ).toBe(1);
    expect(countOversizedNotes({ notes: [] })).toBe(0);
    expect(countOversizedNotes(null)).toBe(0);
  });
});

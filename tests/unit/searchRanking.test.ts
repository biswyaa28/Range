import { describe, expect, it } from 'vitest';
import { matchRanges, rankSearch, type SearchEntry } from '@/domain/search';

const entries: SearchEntry[] = [
  {
    key: 'task-1',
    id: '1',
    kind: 'task',
    title: 'Finish physics report',
    body: 'Chapter 4',
    updatedAt: '2026-05-01T10:00:00.000Z',
  },
  {
    key: 'task-2',
    id: '2',
    kind: 'task',
    title: 'Physics reading',
    updatedAt: '2026-05-02T10:00:00.000Z',
  },
  {
    key: 'note-1',
    id: '3',
    kind: 'note',
    title: 'Lab notes',
    body: 'Physics lab measurements',
    private: true,
    updatedAt: '2026-05-03T10:00:00.000Z',
  },
  {
    key: 'block-1',
    id: '4',
    kind: 'block',
    title: 'Physics lecture',
    subtitle: 'Mon 09:00',
    updatedAt: '2026-04-30T10:00:00.000Z',
  },
  {
    key: 'deadline-1',
    id: '5',
    kind: 'deadline',
    title: 'Problem set 3',
    subtitle: 'PHYS 201',
    updatedAt: '2026-05-04T10:00:00.000Z',
  },
];

describe('search ranking', () => {
  it('puts an exact title first and keeps body-only matches below title matches', () => {
    const results = rankSearch(entries, 'physics');
    expect(results.map((result) => result.key)).toEqual([
      'task-2',
      'block-1',
      'task-1',
      'note-1',
    ]);
  });

  it('requires every query word to match somewhere', () => {
    expect(rankSearch(entries, 'physics measurements').map((r) => r.key)).toEqual(['note-1']);
    expect(rankSearch(entries, 'physics chemistry')).toEqual([]);
  });

  it('includes private notes locally and keeps the flag', () => {
    const [result] = rankSearch(entries, 'lab');
    expect(result?.key).toBe('note-1');
    expect(result?.private).toBe(true);
  });

  it('matches timetable and deadline subtitles', () => {
    expect(rankSearch(entries, 'PHYS 201').map((r) => r.key)).toEqual(['deadline-1']);
    expect(rankSearch(entries, 'mon').map((r) => r.key)).toEqual(['block-1']);
  });

  it('highlights every case-insensitive occurrence without overlap', () => {
    expect(matchRanges('Physics physics', 'phys')).toEqual([
      { start: 0, end: 4 },
      { start: 8, end: 12 },
    ]);
    expect(matchRanges('Physics', '')).toEqual([]);
  });

  it('respects the result limit', () => {
    expect(rankSearch(entries, 'physics', 2)).toHaveLength(2);
  });
});

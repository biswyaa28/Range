import { describe, it, expect } from 'vitest';
import {
  todayISO,
  addDays,
  diffDays,
  mondayIndex,
  hmToMin,
  fmtHM,
  snap15,
  normTs,
  fmtMS,
  FixedClock,
} from '@/domain/dates';
import {
  blockOccursOn,
  blockDoneOn,
  toggleBlockDoneOnDate,
  calItemsForDate,
  calLayout,
} from '@/domain/recurrence';
import type { Block } from '@/domain/types';

describe('domain dates & recurrence', () => {
  const clock = new FixedClock('2026-04-13T10:30:00.000Z'); // Monday

  it('handles ISO conversion and date math', () => {
    expect(todayISO(clock)).toBe('2026-04-13');
    expect(addDays('2026-04-13', 2)).toBe('2026-04-15');
    expect(addDays('2026-04-13', -3)).toBe('2026-04-10');
    expect(diffDays('2026-04-15', '2026-04-13')).toBe(2);
    expect(mondayIndex(new Date('2026-04-13T12:00:00Z'))).toBe(0); // Monday is 0
    expect(mondayIndex(new Date('2026-04-19T12:00:00Z'))).toBe(6); // Sunday is 6
  });

  it('formats times and snaps to 15 minutes', () => {
    expect(hmToMin('09:15')).toBe(555);
    expect(fmtHM(555)).toBe('09:15');
    expect(snap15(14)).toBe(15);
    expect(snap15(7)).toBe(0);
    expect(snap15(22)).toBe(15);
    expect(snap15(23)).toBe(30);
    expect(fmtMS(65000)).toBe('01:05');
  });

  it('normalizes timestamps', () => {
    expect(normTs('2026-04-13T10:00:00.000Z')).toBe('2026-04-13T10:00:00.000Z');
    expect(normTs('2026-04-13 10:00:00')).toBeTruthy();
    expect(normTs('')).toBeNull();
    expect(normTs(null)).toBeNull();
  });

  it('handles block recurrence for weekly vs one-off dates', () => {
    const weeklyBlock: Block = {
      id: 'b1',
      title: 'Weekly Monday Class',
      day: 0,
      start: '09:00',
      end: '10:00',
      category: 'class',
      done: false,
      doneDates: ['2026-04-13'],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      deleted: false,
      deviceId: 'dev1',
    };

    const oneOffBlock: Block = {
      id: 'b2',
      title: 'One-off Doctor Visit',
      day: '2026-04-14',
      start: '14:00',
      end: '15:00',
      category: 'personal',
      done: false,
      doneDates: [],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      deleted: false,
      deviceId: 'dev1',
    };

    // 2026-04-13 is Monday (0)
    expect(blockOccursOn(weeklyBlock, '2026-04-13')).toBe(true);
    expect(blockOccursOn(weeklyBlock, '2026-04-14')).toBe(false);

    // One-off
    expect(blockOccursOn(oneOffBlock, '2026-04-14')).toBe(true);
    expect(blockOccursOn(oneOffBlock, '2026-04-13')).toBe(false);

    // Completion checks
    expect(blockDoneOn(weeklyBlock, '2026-04-13')).toBe(true);
    expect(blockDoneOn(weeklyBlock, '2026-04-20')).toBe(false);

    toggleBlockDoneOnDate(weeklyBlock, '2026-04-20');
    expect(blockDoneOn(weeklyBlock, '2026-04-20')).toBe(true);
    toggleBlockDoneOnDate(weeklyBlock, '2026-04-20');
    expect(blockDoneOn(weeklyBlock, '2026-04-20')).toBe(false);

    // One-off completion toggle
    expect(blockDoneOn(oneOffBlock, '2026-04-14')).toBe(false);
    toggleBlockDoneOnDate(oneOffBlock, '2026-04-14');
    expect(blockDoneOn(oneOffBlock, '2026-04-14')).toBe(true);
  });

  it('computes side-by-side layout columns for overlapping blocks', () => {
    const b1: Block = {
      id: 'b1',
      title: 'Block 1',
      day: '2026-04-13',
      start: '09:00',
      end: '10:30',
      category: 'class',
      done: false,
      doneDates: [],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      deleted: false,
      deviceId: 'dev1',
    };
    const b2: Block = {
      id: 'b2',
      title: 'Block 2',
      day: '2026-04-13',
      start: '09:30',
      end: '11:00',
      category: 'study',
      done: false,
      doneDates: [],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      deleted: false,
      deviceId: 'dev1',
    };

    const items = calItemsForDate([b1, b2], '2026-04-13', { s: 480, e: 1200 });
    expect(items.length).toBe(2);

    const layout = calLayout(items);
    expect(layout.length).toBe(2);
    expect(layout[0]?.cols).toBe(2);
    expect(layout[1]?.cols).toBe(2);
    expect(layout[0]?.col).not.toBe(layout[1]?.col);
  });
});

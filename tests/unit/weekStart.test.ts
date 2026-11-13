import { describe, it, expect } from 'vitest';
import {
  monthGridStart,
  startOfWeek,
  weekDayIsos,
  weekDayLabels,
  weekIndex,
} from '@/domain/dates';

describe('week start', () => {
  // 15 April 2026 is a Wednesday.
  it('builds a Monday-first week', () => {
    expect(startOfWeek('2026-04-15', 1)).toBe('2026-04-13');
    expect(weekDayIsos('2026-04-15', 1)).toEqual([
      '2026-04-13',
      '2026-04-14',
      '2026-04-15',
      '2026-04-16',
      '2026-04-17',
      '2026-04-18',
      '2026-04-19',
    ]);
    expect(weekDayLabels(1)[0]).toBe('MON');
  });

  it('builds a Sunday-first week', () => {
    expect(startOfWeek('2026-04-15', 0)).toBe('2026-04-12');
    expect(weekDayIsos('2026-04-15', 0)).toEqual([
      '2026-04-12',
      '2026-04-13',
      '2026-04-14',
      '2026-04-15',
      '2026-04-16',
      '2026-04-17',
      '2026-04-18',
    ]);
    expect(weekDayLabels(0)[0]).toBe('SUN');
  });

  it('builds a Saturday-first week', () => {
    expect(startOfWeek('2026-04-15', 6)).toBe('2026-04-11');
    expect(weekDayIsos('2026-04-15', 6)[0]).toBe('2026-04-11');
    expect(weekDayLabels(6)[0]).toBe('SAT');
  });

  it('places a date at the right index for each start day', () => {
    const sunday = new Date(2026, 3, 12);
    expect(weekIndex(sunday, 0)).toBe(0);
    expect(weekIndex(sunday, 1)).toBe(6);
    expect(weekIndex(sunday, 6)).toBe(1);
  });

  it('handles a month boundary in the grid', () => {
    // 1 March 2026 is a Sunday.
    expect(monthGridStart('2026-03-01', 1)).toBe('2026-02-23');
    expect(monthGridStart('2026-03-01', 0)).toBe('2026-03-01');
    expect(monthGridStart('2026-03-01', 6)).toBe('2026-02-28');
    // April 2026 starts on a Wednesday.
    expect(monthGridStart('2026-04-15', 1)).toBe('2026-03-30');
    expect(monthGridStart('2026-04-15', 0)).toBe('2026-03-29');
  });

  it('keeps a later month boundary correct with a Sunday start', () => {
    // 1 November 2026 is a Sunday: the grid starts that day.
    expect(monthGridStart('2026-11-13', 0)).toBe('2026-11-01');
    // 1 February 2026 is a Sunday too; January starts on a Thursday.
    expect(monthGridStart('2026-02-13', 0)).toBe('2026-02-01');
    expect(monthGridStart('2026-01-13', 0)).toBe('2025-12-28');
  });
});

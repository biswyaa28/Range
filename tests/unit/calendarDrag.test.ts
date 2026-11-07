import { describe, expect, it } from 'vitest';
import {
  columnAtX,
  createDragRange,
  dragGhostLabel,
  formatDuration,
  minuteAtY,
  moveBlockDay,
  moveRange,
  moveRangeTo,
  rangeDuration,
  resizeRangeEnd,
  snapMinute,
} from '@/domain/calendarDrag';

const FULL_DAY = { s: 0, e: 1440 };
const WAKING = { s: 420, e: 1380 };

describe('calendarDrag', () => {
  it('snaps to the nearest 15 minutes', () => {
    expect(snapMinute(547)).toBe(540);
    expect(snapMinute(548)).toBe(555);
    expect(snapMinute(600)).toBe(600);
  });

  it('creates a range that is clamped to the visible grid', () => {
    expect(createDragRange(488, 573, WAKING)).toEqual({ start: 495, end: 570 });
    expect(createDragRange(400, 460, WAKING)).toEqual({ start: 420, end: 465 });
    expect(createDragRange(1373, 1430, WAKING)).toEqual({ start: 1365, end: 1380 });
  });

  it('enforces the 15-minute minimum when creating', () => {
    expect(createDragRange(600, 600, FULL_DAY)).toEqual({ start: 600, end: 615 });
    expect(createDragRange(600, 540, FULL_DAY)).toEqual({ start: 600, end: 615 });
  });

  it('moves a range while preserving duration and clamping to the grid', () => {
    const moved = moveRangeTo(500, 90, WAKING);
    expect(moved).toEqual({ start: 495, end: 585 });

    const top = moveRangeTo(100, 60, WAKING);
    expect(top).toEqual({ start: 420, end: 480 });

    const bottom = moveRangeTo(1400, 60, WAKING);
    expect(bottom).toEqual({ start: 1320, end: 1380 });
  });

  it('clamps within an hours-limited grid', () => {
    const oneHour = { s: 600, e: 660 };
    expect(moveRangeTo(600, 60, oneHour)).toEqual({ start: 600, end: 660 });
    expect(moveRangeTo(700, 60, oneHour)).toEqual({ start: 600, end: 660 });
    expect(createDragRange(650, 700, oneHour)).toEqual({ start: 645, end: 660 });
  });

  it('moves by a delta and snaps keyboard moves', () => {
    expect(moveRange(540, 600, 15, FULL_DAY)).toEqual({ start: 555, end: 615 });
    expect(moveRange(600, 660, -120, FULL_DAY)).toEqual({ start: 480, end: 540 });
    expect(moveRange(540, 600, -600, FULL_DAY)).toEqual({ start: 0, end: 60 });
  });

  it('keeps weekly blocks numeric and one-off blocks dated on cross-day moves', () => {
    expect(moveBlockDay(2, '2026-04-17')).toBe(4);
    expect(moveBlockDay('2026-04-13', '2026-04-17')).toBe('2026-04-17');
  });

  it('resizes from the bottom edge with a minimum duration', () => {
    expect(resizeRangeEnd(540, 620, FULL_DAY)).toEqual({ start: 540, end: 615 });
    expect(resizeRangeEnd(540, 480, FULL_DAY)).toEqual({ start: 540, end: 555 });
    expect(resizeRangeEnd(540, 1500, FULL_DAY)).toEqual({ start: 540, end: 1440 });
  });

  it('clamps a move at the midnight edge without wrapping', () => {
    expect(moveRange(1380, 1440, 60, FULL_DAY)).toEqual({ start: 1380, end: 1440 });
    expect(resizeRangeEnd(1380, 1500, FULL_DAY)).toEqual({ start: 1380, end: 1440 });
    expect(rangeDuration(1380, 1440)).toBe(60);
  });

  it('converts pointer coordinates and picks the column under x', () => {
    expect(minuteAtY(100, 0, 600, { s: 420, e: 1020 })).toBe(520);
    const columns = [
      { iso: '2026-04-13', left: 0, right: 100 },
      { iso: '2026-04-14', left: 100, right: 200 },
    ];
    expect(columnAtX(150, columns)).toBe(1);
    expect(columnAtX(-20, columns)).toBe(0);
    expect(columnAtX(300, columns)).toBe(1);
    expect(columnAtX(50, [], 3)).toBe(3);
  });

  it('formats durations and ghost labels', () => {
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(45)).toBe('45m');
    expect(dragGhostLabel({ start: 540, end: 630 })).toBe('09:00 – 10:30 · 1h 30m');
  });
});

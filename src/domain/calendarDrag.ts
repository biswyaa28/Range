import { fmtHM, fromISO, mondayIndex } from './dates';

/** Minutes between snap points for every calendar drag. */
export const DRAG_SNAP_MINUTES = 15;

/** Shortest block a drag or resize may produce. */
export const MIN_BLOCK_MINUTES = 15;

export interface GridRange {
  /** First visible minute of the day (minutes from midnight). */
  s: number;
  /** Last visible minute of the day (minutes from midnight). */
  e: number;
}

export interface MinuteRange {
  start: number;
  end: number;
}

export interface ColumnBounds {
  iso: string;
  left: number;
  right: number;
}

export function clampMinute(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to the nearest 15-minute mark. */
export function snapMinute(value: number): number {
  return Math.round(value / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
}

/** Duration of a block in minutes, guarding against inverted ranges. */
export function rangeDuration(start: number, end: number): number {
  return Math.max(MIN_BLOCK_MINUTES, end - start);
}

/** Converts a viewport y coordinate to a minute inside a canvas. */
export function minuteAtY(
  y: number,
  canvasTop: number,
  canvasHeight: number,
  grid: GridRange,
): number {
  const ratio = (y - canvasTop) / Math.max(1, canvasHeight);
  return grid.s + ratio * (grid.e - grid.s);
}

/**
 * Press-drag creation. The press minute is the fixed start; dragging sets the
 * end. Both ends snap to 15 minutes and stay inside the visible grid.
 */
export function createDragRange(
  anchorMinute: number,
  pointerMinute: number,
  grid: GridRange,
): MinuteRange {
  const maxStart = Math.max(grid.s, grid.e - MIN_BLOCK_MINUTES);
  const start = clampMinute(snapMinute(anchorMinute), grid.s, maxStart);
  const guessedEnd = snapMinute(Math.max(pointerMinute, start + MIN_BLOCK_MINUTES));
  const end = clampMinute(guessedEnd, start + MIN_BLOCK_MINUTES, grid.e);
  return { start, end: Math.max(start + MIN_BLOCK_MINUTES, end) };
}

/**
 * Moves a range to an absolute start minute while preserving its duration.
 * The new start is snapped and clamped so start and end stay inside the grid.
 */
export function moveRangeTo(
  proposedStart: number,
  duration: number,
  grid: GridRange,
): MinuteRange {
  const safeDuration = clampMinute(duration, MIN_BLOCK_MINUTES, grid.e - grid.s);
  const latestStart = Math.max(grid.s, grid.e - safeDuration);
  const start = clampMinute(snapMinute(proposedStart), grid.s, latestStart);
  return { start, end: start + safeDuration };
}

/** Moves a range by a delta in minutes (used by keyboard moves). */
export function moveRange(
  start: number,
  end: number,
  delta: number,
  grid: GridRange,
): MinuteRange {
  return moveRangeTo(start + delta, rangeDuration(start, end), grid);
}

/**
 * Resizes a block from its bottom edge. The end snaps and never crosses the
 * start by less than the 15-minute minimum.
 */
export function resizeRangeEnd(
  start: number,
  proposedEnd: number,
  grid: GridRange,
): MinuteRange {
  const minEnd = Math.min(grid.e, start + MIN_BLOCK_MINUTES);
  const end = clampMinute(snapMinute(proposedEnd), minEnd, grid.e);
  return { start, end };
}

/**
 * Cross-day moves keep the block's recurrence shape:
 * weekly blocks store the weekday number, one-off blocks store the ISO date.
 */
export function moveBlockDay(day: number | string, targetISO: string): number | string {
  return typeof day === 'string' ? targetISO : mondayIndex(fromISO(targetISO));
}

/** Index of the column under a viewport x coordinate, clamped to the edges. */
export function columnAtX(
  x: number,
  columns: ColumnBounds[],
  fallback = 0,
): number {
  if (columns.length === 0) return fallback;
  const found = columns.findIndex((column) => x >= column.left && x < column.right);
  if (found >= 0) return found;
  const first = columns[0];
  return first && x < first.left ? 0 : columns.length - 1;
}

/** Compact duration used in drag ghost labels, e.g. "1h 30m" or "45m". */
export function formatDuration(minutes: number): string {
  const total = Math.max(MIN_BLOCK_MINUTES, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

/** Label shown inside the live drag ghost. */
export function dragGhostLabel(range: MinuteRange): string {
  return `${fmtHM(range.start)} – ${fmtHM(range.end)} · ${formatDuration(
    range.end - range.start,
  )}`;
}

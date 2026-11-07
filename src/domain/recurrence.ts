import type { Block } from './types';
import { fromISO, mondayIndex, hmToMin } from './dates';

/**
 * Checks whether a block is scheduled on a given ISO date (YYYY-MM-DD).
 * A block occurs if its day is a weekly recurring number (0-6) matching the ISO date's weekday,
 * or if its day is an exact matching ISO date string.
 */
export function blockOccursOn(block: Block, iso: string): boolean {
  if (block.deleted) return false;
  if (typeof block.day === 'number') {
    const di = mondayIndex(fromISO(iso));
    return block.day === di;
  }
  return block.day === iso;
}

/**
 * Filter and sort blocks occurring on a given ISO date.
 */
export function blocksForDate(blocks: Block[], iso: string): Block[] {
  return blocks
    .filter((b) => blockOccursOn(b, iso))
    .slice()
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

/**
 * Checks if a block is completed on a given date.
 * One-off blocks check block.done directly.
 * Recurring weekly blocks check if the iso date is contained in block.doneDates.
 */
export function blockDoneOn(b: Block, iso: string): boolean {
  if (typeof b.day === 'string') return !!b.done;
  return Array.isArray(b.doneDates) && b.doneDates.indexOf(iso) !== -1;
}

/**
 * Toggle block completion status on a given date.
 * Mutates the block in place (or returns updated fields).
 */
export function toggleBlockDoneOnDate(b: Block, iso: string): void {
  if (typeof b.day === 'string') {
    b.done = !b.done;
  } else {
    if (!Array.isArray(b.doneDates)) b.doneDates = [];
    const i = b.doneDates.indexOf(iso);
    if (i >= 0) {
      b.doneDates.splice(i, 1);
    } else {
      b.doneDates.push(iso);
    }
  }
}

export interface GridBound {
  s: number; // minutes from midnight start
  e: number; // minutes from midnight end
}

export interface CalItem {
  b: Block;
  s: number; // clipped start min
  e: number; // clipped end min
}

export interface CalLayoutItem {
  it: CalItem;
  col: number;
  cols: number;
}

/**
 * Clips blocks on a date to a time grid, ensuring min duration 30 min if e <= s.
 */
export function calItemsForDate(blocks: Block[], iso: string, grid: GridBound): CalItem[] {
  return blocksForDate(blocks, iso)
    .map((b) => {
      const s = hmToMin(b.start);
      let e = hmToMin(b.end);
      if (!(e > s)) e = s + 30;
      const c0 = Math.max(s, grid.s);
      const c1 = Math.min(e, grid.e);
      return c1 - c0 <= 0 ? null : { b, s: c0, e: c1 };
    })
    .filter((x): x is CalItem => x !== null)
    .sort((x, y) => x.s - y.s || x.e - y.e);
}

/**
 * Computes side-by-side layout columns for overlapping items.
 * Matches legacy calLayout algorithm exactly.
 */
export function calLayout(items: CalItem[]): CalLayoutItem[] {
  const out: CalLayoutItem[] = [];
  let cluster: CalItem[] = [];
  let end = -1;

  const flush = () => {
    const colEnd: number[] = [];
    const cols = cluster.map((it) => {
      let c = colEnd.findIndex((x) => x <= it.s);
      if (c < 0) c = colEnd.length;
      colEnd[c] = it.e;
      return c;
    });
    const n = Math.max(1, colEnd.length);
    cluster.forEach((it, i) => out.push({ it, col: cols[i] ?? 0, cols: n }));
    cluster = [];
  };

  items.forEach((it) => {
    if (cluster.length && it.s >= end) flush();
    cluster.push(it);
    end = Math.max(end, it.e);
  });
  if (cluster.length) flush();

  return out;
}

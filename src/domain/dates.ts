export interface Clock {
  now(): Date;
  nowISO(): string;
  todayISO(): string;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowISO(): string {
    return this.now().toISOString();
  }

  todayISO(): string {
    return toISO(this.now());
  }
}

export class FixedClock implements Clock {
  private currentDate: Date;

  constructor(dateOrISO: Date | string = '2026-04-13T10:00:00.000Z') {
    this.currentDate = typeof dateOrISO === 'string' ? new Date(dateOrISO) : new Date(dateOrISO.getTime());
  }

  setDate(dateOrISO: Date | string): void {
    this.currentDate = typeof dateOrISO === 'string' ? new Date(dateOrISO) : new Date(dateOrISO.getTime());
  }

  advanceMs(ms: number): void {
    this.currentDate = new Date(this.currentDate.getTime() + ms);
  }

  now(): Date {
    return new Date(this.currentDate.getTime());
  }

  nowISO(): string {
    return this.now().toISOString();
  }

  todayISO(): string {
    return toISO(this.now());
  }
}

export const defaultClock = new SystemClock();

export const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const DAY_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

export function toISO(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export function fromISO(iso: string): Date {
  const parts = String(iso).split('-').map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day);
}

export function todayISO(clock: Clock = defaultClock): string {
  return clock.todayISO();
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 864e5);
}

/**
 * Our week index: 0 = Monday ... 6 = Sunday (grid runs Mon-Sun).
 */
export function mondayIndex(d?: Date, clock: Clock = defaultClock): number {
  const date = d || clock.now();
  return (date.getDay() + 6) % 7;
}

export function nowHM(clock: Clock = defaultClock): string {
  return clock.now().toTimeString().slice(0, 5);
}

export function nowHMS(clock: Clock = defaultClock): string {
  return clock.now().toTimeString().slice(0, 8);
}

export function hmToMin(s: string): number {
  const p = String(s).split(':');
  const h = +(p[0] ?? 0);
  const m = +(p[1] ?? 0);
  return h * 60 + (m || 0);
}

export function fmtHM(min: number): string {
  const normalized = ((min % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

/**
 * Snaps minutes to 15-minute intervals.
 */
export function snap15(min: number): number {
  return Math.round(min / 15) * 15;
}

/**
 * Normalizes a stored timestamp to full ISO-Z.
 */
export function normTs(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) return v;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function fmtNice(iso: string): string {
  return fromISO(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtShort(iso: string): string {
  return fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/**
 * A short, human description of how long ago something happened, such as
 * "5 minutes ago". Returns null when the timestamp cannot be read, so the
 * caller can decide what to show instead.
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;

  const diff = nowMs - then;
  const ahead = diff < 0;
  const abs = Math.abs(diff);

  let label: string;
  if (abs < MINUTE_MS) return 'just now';
  if (abs < HOUR_MS) label = plural(Math.round(abs / MINUTE_MS), 'minute');
  else if (abs < DAY_MS) label = plural(Math.round(abs / HOUR_MS), 'hour');
  else if (abs < 30 * DAY_MS) label = plural(Math.round(abs / DAY_MS), 'day');
  else if (abs < 365 * DAY_MS) label = plural(Math.round(abs / (30 * DAY_MS)), 'month');
  else label = plural(Math.round(abs / (365 * DAY_MS)), 'year');

  return ahead ? `in ${label}` : `${label} ago`;
}

export function fmtStamp(v: string | number | Date): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function fmtMS(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}


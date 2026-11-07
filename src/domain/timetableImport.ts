import { DAY_FULL, DAY_SHORT } from './dates';

export interface TimetableImportRowError {
  row: number;
  reason: string;
}

export interface TimetableImportValidRow {
  row: number;
  title: string;
  day: number | string;
  start: string;
  end: string;
  category?: string;
  source?: string;
}

export interface TimetableImportResult {
  valid: TimetableImportValidRow[];
  errors: TimetableImportRowError[];
  fatal?: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeImportDay(v: unknown): number | string | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 6) {
    return Math.floor(v);
  }
  const s = String(v == null ? '' : v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d$/.test(s)) {
    const num = parseInt(s, 10);
    return num >= 0 && num <= 6 ? num : null;
  }
  const low = s.toLowerCase();
  for (let i = 0; i < 7; i++) {
    const full = DAY_FULL[i]?.toLowerCase();
    const short = DAY_SHORT[i]?.toLowerCase();
    const three = full ? full.slice(0, 3) : '';
    if (low === full || low === short || low === three) {
      return i;
    }
  }
  return null;
}

export function validateTimetableImport(rawText: string): TimetableImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (e: unknown) {
    return {
      valid: [],
      errors: [],
      fatal: 'Invalid JSON: ' + (e instanceof Error ? e.message : String(e)),
    };
  }

  let items: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    'blocks' in parsed &&
    Array.isArray((parsed as { blocks: unknown[] }).blocks)
  ) {
    items = (parsed as { blocks: unknown[] }).blocks;
  }

  if (!items) {
    return {
      valid: [],
      errors: [],
      fatal: 'Expected a JSON array of blocks (or an object with a "blocks" array).',
    };
  }

  if (items.length === 0) {
    return {
      valid: [],
      errors: [],
      fatal: 'The list is empty.',
    };
  }

  const valid: TimetableImportValidRow[] = [];
  const errors: TimetableImportRowError[] = [];

  items.forEach((item, index) => {
    const rowNum = index + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ row: rowNum, reason: 'Not an object' });
      return;
    }

    const obj = item as Record<string, unknown>;
    const title = String(obj['title'] || '').trim();
    const start = String(obj['start'] || '');
    const end = String(obj['end'] || '');
    const rawDay = obj['day'];
    let day = normalizeImportDay(rawDay);

    if (typeof day === 'string' && isNaN(new Date(day + 'T00:00:00').getTime())) {
      day = null;
    }

    const rowErrors: string[] = [];
    if (!title) rowErrors.push('Missing title');
    if (day === null) rowErrors.push('Unknown day (use 0–6, a weekday name or YYYY-MM-DD)');
    if (!TIME_RE.test(start)) rowErrors.push('Start must be HH:MM');
    if (!TIME_RE.test(end)) rowErrors.push('End must be HH:MM');
    if (TIME_RE.test(start) && TIME_RE.test(end) && end <= start) {
      rowErrors.push('End must be after start');
    }

    if (rowErrors.length > 0) {
      rowErrors.forEach((reason) => errors.push({ row: rowNum, reason }));
    } else if (day !== null) {
      valid.push({
        row: rowNum,
        title,
        day,
        start,
        end,
        category: typeof obj['category'] === 'string' ? obj['category'] : undefined,
        source: typeof obj['source'] === 'string' ? obj['source'] : undefined,
      });
    }
  });

  return { valid, errors };
}


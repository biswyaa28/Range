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

/** Header names accepted in a CSV import, in any order. */
const CSV_COLUMNS = ['day', 'start', 'end', 'title', 'type', 'category'] as const;

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

/** RFC-4180-ish CSV splitter: quotes, escaped quotes and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function isHeader(cells: string[]): boolean {
  const seen = cells.map((cell) => cell.trim().toLowerCase());
  return seen.includes('day') && seen.includes('start') && seen.includes('end') && seen.includes('title');
}

/** Raw objects for preview rendering, from JSON or CSV input. */
export function parseTimetableItems(text: string): unknown[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJsonItems(trimmed);
  }

  const rows = parseCsv(trimmed);
  if (rows.length === 0) return [];
  const header = isHeader(rows[0]!) ? rows.shift()! : null;
  const columns = (header ?? ['day', 'start', 'end', 'title', 'type']).map((cell) =>
    cell.trim().toLowerCase(),
  );

  return rows.map((cells) => {
    const item: Record<string, string> = {};
    columns.forEach((column, index) => {
      if ((CSV_COLUMNS as readonly string[]).includes(column)) {
        item[column === 'type' ? 'category' : column] = (cells[index] ?? '').trim();
      }
    });
    return item;
  });
}

function parseJsonItems(text: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'blocks' in parsed &&
      Array.isArray((parsed as { blocks: unknown[] }).blocks)
    ) {
      return (parsed as { blocks: unknown[] }).blocks;
    }
  } catch {
    // validation reports the parse error
  }
  return [];
}

export function validateTimetableImport(rawText: string): TimetableImportResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { valid: [], errors: [], fatal: 'Nothing to import.' };
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return validateJson(trimmed);
  }
  return validateCsv(trimmed);
}

function validateJson(rawText: string): TimetableImportResult {
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

  return validateItems(items);
}

function validateCsv(rawText: string): TimetableImportResult {
  const rows = parseCsv(rawText);
  if (rows.length === 0) {
    return { valid: [], errors: [], fatal: 'The CSV is empty.' };
  }
  if (!isHeader(rows[0]!)) {
    return {
      valid: [],
      errors: [],
      fatal: 'CSV needs a header row: day,start,end,title,type.',
    };
  }

  const header = rows[0]!.map((cell) => cell.trim().toLowerCase());
  const items = rows.slice(1).map((cells) => {
    const item: Record<string, string> = {};
    header.forEach((column, index) => {
      if ((CSV_COLUMNS as readonly string[]).includes(column)) {
        item[column === 'type' ? 'category' : column] = (cells[index] ?? '').trim();
      }
    });
    return item;
  });

  if (items.length === 0) {
    return { valid: [], errors: [], fatal: 'The CSV has a header but no rows.' };
  }

  return validateItems(items);
}

function validateItems(items: unknown[]): TimetableImportResult {
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

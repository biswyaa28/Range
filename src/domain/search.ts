export type SearchKind = 'task' | 'note' | 'block' | 'deadline';

export interface SearchEntry {
  key: string;
  id: string;
  kind: SearchKind;
  title: string;
  body?: string;
  subtitle?: string;
  updatedAt?: string;
  /** Private notes stay local; the result is still searchable and flagged. */
  private?: boolean;
}

export interface RankedSearchEntry extends SearchEntry {
  score: number;
  titleRanges: TextRange[];
}

export interface TextRange {
  start: number;
  end: number;
}

function lower(value: string | undefined): string {
  return String(value ?? '').toLocaleLowerCase();
}

/** Case-insensitive, non-overlapping ranges used for safe <mark> output. */
export function matchRanges(text: string, query: string): TextRange[] {
  const needle = lower(query).trim();
  if (!needle) return [];
  const haystack = text.toLocaleLowerCase();
  const ranges: TextRange[] = [];
  let from = 0;
  while (from < haystack.length) {
    const start = haystack.indexOf(needle, from);
    if (start < 0) break;
    ranges.push({ start, end: start + needle.length });
    from = start + needle.length;
  }
  return ranges;
}

function wordStart(haystack: string, needle: string): boolean {
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) return false;
    if (index === 0 || /[\s\-_/(.,:;]/.test(haystack[index - 1] ?? '')) return true;
    from = index + 1;
  }
  return false;
}

function fieldScore(
  title: string,
  body: string,
  subtitle: string,
  query: string,
  tokens: string[],
): number {
  const all = `${title}\n${body}\n${subtitle}`;
  if (!tokens.every((token) => all.includes(token))) return 0;

  let score = 0;
  if (title === query) score += 120;
  else if (title.startsWith(query)) score += 100;
  else if (wordStart(title, query)) score += 80;
  else if (title.includes(query)) score += 60;

  if (body.includes(query)) score += 40;
  if (subtitle.includes(query)) score += 30;

  // Every token in the title is a stronger signal than one long phrase.
  for (const token of tokens) {
    if (title.includes(token)) score += 8;
    else if (subtitle.includes(token)) score += 4;
    else if (body.includes(token)) score += 2;
  }

  // Prefer the kind with a shorter, more specific title when scores tie.
  score += Math.max(0, 12 - Math.floor(title.length / 12));
  return score;
}

/**
 * Ranks local records for the command search. Title matches outrank body
 * matches, all query words must appear somewhere, and private notes are
 * included locally so the user can still find them on this device.
 */
export function rankSearch(
  entries: readonly SearchEntry[],
  query: string,
  limit = 12,
): RankedSearchEntry[] {
  const needle = lower(query).trim().replace(/\s+/g, ' ');
  if (!needle) return [];
  const tokens = needle.split(' ').filter(Boolean);
  const seen = new Set<string>();
  const ranked: RankedSearchEntry[] = [];

  for (const entry of entries) {
    if (seen.has(entry.key)) continue;
    const title = lower(entry.title);
    const body = lower(entry.body);
    const subtitle = lower(entry.subtitle);
    const score = fieldScore(title, body, subtitle, needle, tokens);
    if (score <= 0) continue;
    seen.add(entry.key);
    ranked.push({
      ...entry,
      score,
      titleRanges: matchRanges(entry.title, needle),
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ad = String(a.updatedAt ?? '');
    const bd = String(b.updatedAt ?? '');
    if (ad !== bd) return bd.localeCompare(ad);
    return a.title.localeCompare(b.title);
  });

  return ranked.slice(0, Math.max(0, limit));
}

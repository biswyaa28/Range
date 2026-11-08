import type { AppRoute } from './useHashRoute';

export type ChordPrefix = 'g' | 'n';

export const CHORD_TIMEOUT_MS = 1000;

export type ChordResolution =
  | { kind: 'route'; route: AppRoute }
  | { kind: 'create'; create: 'task' | 'block' | 'note' }
  | { kind: 'restart'; chord: ChordPrefix }
  | { kind: 'miss' };

const G_ROUTES: Record<string, AppRoute> = {
  h: 'home',
  p: 'plan',
  t: 'tasks',
  n: 'notes',
  f: 'focus',
  i: 'insights',
};

const N_CREATES: Record<string, 'task' | 'block' | 'note'> = {
  t: 'task',
  b: 'block',
  o: 'note',
};

/**
 * Pure second-key resolution for the `g …` and `n …` chords. Pressing the
 * same prefix again restarts the chord (and its 1 s window).
 */
export function resolveChord(prefix: ChordPrefix, key: string): ChordResolution {
  const lower = key.toLowerCase();
  if (lower === prefix) return { kind: 'restart', chord: prefix };
  if (prefix === 'g') {
    const route = G_ROUTES[lower];
    return route ? { kind: 'route', route } : { kind: 'miss' };
  }
  const create = N_CREATES[lower];
  return create ? { kind: 'create', create } : { kind: 'miss' };
}

export function isChordPrefix(key: string): key is ChordPrefix {
  return key === 'g' || key === 'n';
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  if (element.getAttribute?.('contenteditable') === 'true') return true;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

import { describe, it, expect } from 'vitest';
import {
  CHORD_TIMEOUT_MS,
  isChordPrefix,
  isTypingTarget,
  resolveChord,
} from '@/hooks/shortcutKeys';
import { fuzzyScore } from '@/features/palette/fuzzy';

describe('resolveChord', () => {
  it('maps every g chord to a route', () => {
    expect(resolveChord('g', 'h')).toEqual({ kind: 'route', route: 'home' });
    expect(resolveChord('g', 'p')).toEqual({ kind: 'route', route: 'plan' });
    expect(resolveChord('g', 't')).toEqual({ kind: 'route', route: 'tasks' });
    expect(resolveChord('g', 'n')).toEqual({ kind: 'route', route: 'notes' });
    expect(resolveChord('g', 'f')).toEqual({ kind: 'route', route: 'focus' });
    expect(resolveChord('g', 'i')).toEqual({ kind: 'route', route: 'insights' });
  });

  it('maps every n chord to a create action', () => {
    expect(resolveChord('n', 't')).toEqual({ kind: 'create', create: 'task' });
    expect(resolveChord('n', 'b')).toEqual({ kind: 'create', create: 'block' });
    expect(resolveChord('n', 'o')).toEqual({ kind: 'create', create: 'note' });
  });

  it('restarts on the same prefix and misses everything else', () => {
    expect(resolveChord('g', 'g')).toEqual({ kind: 'restart', chord: 'g' });
    expect(resolveChord('n', 'N')).toEqual({ kind: 'restart', chord: 'n' });
    expect(resolveChord('g', 'x')).toEqual({ kind: 'miss' });
    expect(resolveChord('n', 'p')).toEqual({ kind: 'miss' });
  });

  it('is case-insensitive and recognises prefixes', () => {
    expect(resolveChord('g', 'P')).toEqual({ kind: 'route', route: 'plan' });
    expect(resolveChord('n', 'O')).toEqual({ kind: 'create', create: 'note' });
    expect(isChordPrefix('g')).toBe(true);
    expect(isChordPrefix('n')).toBe(true);
    expect(isChordPrefix('h')).toBe(false);
    expect(CHORD_TIMEOUT_MS).toBe(1000);
  });
});

describe('isTypingTarget', () => {
  it('treats inputs, textareas, selects and contenteditable as typing', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
  });

  it('lets body, buttons and null through', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
  });
});

describe('fuzzyScore', () => {
  it('returns zero for an empty query and -1 for a non-subsequence', () => {
    expect(fuzzyScore('', 'Plan')).toBe(0);
    expect(fuzzyScore('zzz', 'Plan')).toBe(-1);
    expect(fuzzyScore('planx', 'Plan')).toBe(-1);
  });

  it('matches case-insensitively and rewards prefixes', () => {
    expect(fuzzyScore('plan', 'Plan')).toBeGreaterThan(0);
    expect(fuzzyScore('tp', 'Today plan')).toBeGreaterThan(0);
    expect(fuzzyScore('task', 'task list')).toBeGreaterThan(
      fuzzyScore('task', 'my task list'),
    );
  });

  it('ranks a direct command ahead of a fuzzy live result', () => {
    const commands = ['Plan', 'New block', 'Start or pause timer'];
    const ranked = commands
      .map((label) => ({ label, score: fuzzyScore('plan', label) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score);
    expect(ranked[0]?.label).toBe('Plan');
  });
});

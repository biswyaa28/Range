import { describe, expect, it } from 'vitest';
import {
  BENTO_SIZE_SPAN,
  applyBentoPreset,
  emptyBentoLayout,
  hideBentoCard,
  moveBentoCard,
  nextBentoSize,
  normalizeBentoHidden,
  normalizeBentoOrder,
  placeBentoCard,
  resolveBentoLayout,
  setBentoSize,
  showBentoCard,
  snapBentoSize,
  visibleBentoOrder,
  type BentoCardSpec,
} from '@/domain/bentoLayout';
import type { BentoCardSize } from '@/domain/types';

const SPECS: BentoCardSpec[] = [
  { id: 'progress', defaultSize: 'M', allowedSizes: ['S', 'M', 'L'] },
  { id: 'weekly', defaultSize: 'XL', allowedSizes: ['M', 'L', 'XL'] },
  { id: 'focus', defaultSize: 'M', allowedSizes: ['S', 'M', 'L'] },
  { id: 'tasks', defaultSize: 'M', allowedSizes: ['S', 'M', 'L', 'XL'] },
  { id: 'upnext', defaultSize: 'M', allowedSizes: ['S', 'M', 'L', 'XL'] },
  { id: 'deadlines', defaultSize: 'L', allowedSizes: ['S', 'M', 'L', 'XL'] },
  { id: 'streak', defaultSize: 'L', allowedSizes: ['S', 'M', 'L', 'XL'] },
  { id: 'quick', defaultSize: 'L', allowedSizes: ['S', 'M', 'L', 'XL'] },
  { id: 'health', defaultSize: 'L', allowedSizes: ['S', 'M', 'L', 'XL'] },
  { id: 'calendar', defaultSize: 'M', allowedSizes: ['S', 'M', 'L', 'XL'] },
  { id: 'timeline', defaultSize: 'XL', allowedSizes: ['S', 'M', 'L', 'XL'] },
];

const ALL = SPECS.map((s) => s.id);

describe('bento layout normalization', () => {
  it('drops unknown ids, dedupes and appends missing ids', () => {
    expect(normalizeBentoOrder(['tasks', 'ghost', 'tasks'], ALL)).toEqual([
      'tasks',
      'progress',
      'weekly',
      'focus',
      'upnext',
      'deadlines',
      'streak',
      'quick',
      'health',
      'calendar',
      'timeline',
    ]);
  });

  it('keeps trailing rail ids last when filling missing cards', () => {
    expect(normalizeBentoOrder(['progress', 'calendar', 'timeline'], ALL, ['calendar', 'timeline'])).toEqual([
      'progress',
      'weekly',
      'focus',
      'tasks',
      'upnext',
      'deadlines',
      'streak',
      'quick',
      'health',
      'calendar',
      'timeline',
    ]);
  });

  it('filters hidden ids and removes duplicates', () => {
    expect(normalizeBentoHidden(['weekly', 'ghost', 'weekly', 'health'], ALL)).toEqual(['weekly', 'health']);
  });
});

describe('bento layout resolution and presets', () => {
  it('uses the selected preset when no layout has been saved', () => {
    const minimal = resolveBentoLayout(emptyBentoLayout(), SPECS, 'minimal');
    expect(minimal.order.slice(0, 4)).toEqual(['progress', 'tasks', 'upnext', 'focus']);
    expect(minimal.hidden).toContain('weekly');
    expect(minimal.size.progress).toBe('L');
  });

  it('falls back to balanced for an unknown preset', () => {
    const balanced = resolveBentoLayout(emptyBentoLayout(), SPECS, 'nope');
    expect(balanced.order[0]).toBe('progress');
    expect(balanced.hidden).toEqual(['streak', 'quick', 'health']);
    expect(balanced.size.weekly).toBe('XL');
  });

  it('keeps saved order and validates saved sizes against allowed sizes', () => {
    const resolved = resolveBentoLayout(
      {
        order: ['tasks', 'progress', 'ghost'],
        size: { tasks: 'XL', progress: 'XL' },
        hidden: ['weekly'],
      },
      SPECS,
      'minimal',
    );
    expect(resolved.order).toEqual([
      'tasks',
      'progress',
      'weekly',
      'focus',
      'upnext',
      'deadlines',
      'streak',
      'quick',
      'health',
      'calendar',
      'timeline',
    ]);
    expect(resolved.size.tasks).toBe('XL');
    expect(resolved.size.progress).toBe('M');
    expect(resolved.hidden).toEqual(['weekly']);
  });

  it('applies every preset with all ids present and hidden filtered', () => {
    (['minimal', 'balanced', 'everything'] as const).forEach((name) => {
      const layout = applyBentoPreset(name, SPECS);
      expect(layout.order).toHaveLength(SPECS.length);
      expect(new Set(layout.order).size).toBe(SPECS.length);
      layout.hidden.forEach((id) => expect(ALL).toContain(id));
    });

    const everything = applyBentoPreset('everything', SPECS);
    expect(everything.hidden).toEqual([]);
    expect(everything.order).toEqual(ALL);
  });
});

describe('bento layout mutations', () => {
  const base = applyBentoPreset('everything', SPECS);

  it('moves cards in visible order and skips hidden cards', () => {
    const withHidden = hideBentoCard(base, 'weekly');
    const moved = moveBentoCard(withHidden, 'progress', 1);

    expect(visibleBentoOrder(moved)).toEqual([
      'focus',
      'progress',
      'tasks',
      'upnext',
      'deadlines',
      'streak',
      'quick',
      'health',
      'calendar',
      'timeline',
    ]);
  });

  it('places a card before another card or after the last visible card', () => {
    const moved = placeBentoCard(base, 'progress', 'calendar');
    expect(visibleBentoOrder(moved).indexOf('progress')).toBe(
      visibleBentoOrder(moved).indexOf('calendar') - 1,
    );

    const appended = placeBentoCard(base, 'progress', 'ghost');
    expect(visibleBentoOrder(appended).at(-1)).toBe('progress');
  });

  it('rejects sizes outside a card contract', () => {
    expect(setBentoSize(base, 'progress', 'XL', SPECS).size.progress).toBe('M');
    expect(setBentoSize(base, 'progress', 'L', SPECS).size.progress).toBe('L');
    expect(setBentoSize(base, 'ghost', 'L', SPECS).size.ghost).toBeUndefined();
  });

  it('hides and shows cards without duplicating them', () => {
    const hidden = hideBentoCard(hideBentoCard(base, 'tasks'), 'tasks');
    expect(hidden.hidden).toEqual(['tasks']);
    expect(visibleBentoOrder(hidden)).not.toContain('tasks');

    const shown = showBentoCard(hidden, 'tasks', SPECS);
    expect(shown.hidden).toEqual([]);
    expect(visibleBentoOrder(shown)).toContain('tasks');

    const unknown = showBentoCard(hidden, 'ghost', SPECS);
    expect(unknown.hidden).toEqual(['tasks']);
  });

  it('cycles sizes and snaps arbitrary spans to allowed sizes', () => {
    const progress = SPECS[0]!;
    expect(nextBentoSize('S', progress)).toBe('M');
    expect(nextBentoSize('L', progress)).toBe('S');

    expect(snapBentoSize(3, progress)).toBe('S');
    expect(snapBentoSize(4, progress)).toBe('M');
    expect(snapBentoSize(5, progress)).toBe('M');
    expect(snapBentoSize(6, progress)).toBe('L');
    expect(snapBentoSize(99, progress)).toBe('L');
    expect(BENTO_SIZE_SPAN.XL).toBe(8);
  });

  it('does not mutate the input layout', () => {
    const before = JSON.stringify(base);
    const sizes: BentoCardSize[] = ['S', 'M', 'L', 'XL'];
    sizes.forEach((size) => setBentoSize(base, 'tasks', size, SPECS));
    hideBentoCard(base, 'tasks');
    moveBentoCard(base, 'tasks', 1);
    expect(JSON.stringify(base)).toBe(before);
  });
});

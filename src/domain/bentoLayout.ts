import type { BentoCardSize, Layout } from './types';

/**
 * Pure layout math for the Home bento grid.
 *
 * The registry owns card ids, allowed sizes and default sizes; this module
 * only knows about those specs so it can normalize, move, resize and hide
 * cards without importing any feature code.
 */

export type BentoPresetName = 'minimal' | 'balanced' | 'everything';

export interface BentoCardSpec {
  id: string;
  defaultSize: BentoCardSize;
  allowedSizes: readonly BentoCardSize[];
}

export interface ResolvedBentoLayout {
  order: string[];
  size: Record<string, BentoCardSize>;
  hidden: string[];
}

export type BentoLayoutInput = Pick<Layout, 'order' | 'size' | 'hidden'>;

export const BENTO_SIZE_SPAN: Record<BentoCardSize, number> = {
  S: 3,
  M: 4,
  L: 6,
  XL: 8,
};

export const BENTO_SIZE_NAME: Record<BentoCardSize, string> = {
  S: 'small',
  M: 'medium',
  L: 'large',
  XL: 'extra large',
};

export const BENTO_GAP = 20;

export const BENTO_PRESET_NAMES: BentoPresetName[] = ['minimal', 'balanced', 'everything'];

interface BentoPresetDefinition {
  /** Empty means the registry order is used (Everything). */
  order: readonly string[];
  size?: Partial<Record<string, BentoCardSize>>;
  hidden: readonly string[];
}

export const BENTO_PRESETS: Record<BentoPresetName, BentoPresetDefinition> = {
  minimal: {
    order: ['progress', 'tasks', 'upnext', 'focus'],
    size: { progress: 'L', tasks: 'L', upnext: 'L', focus: 'L' },
    hidden: ['weekly', 'inbox', 'deadlines', 'streak', 'quick', 'health', 'calendar', 'timeline'],
  },
  balanced: {
    order: ['progress', 'weekly', 'focus', 'tasks', 'upnext', 'inbox', 'deadlines', 'calendar', 'timeline'],
    size: {
      progress: 'M',
      weekly: 'XL',
      focus: 'M',
      tasks: 'M',
      upnext: 'M',
      inbox: 'M',
      deadlines: 'L',
      calendar: 'L',
      timeline: 'L',
    },
    hidden: ['streak', 'quick', 'health'],
  },
  everything: {
    order: [],
    hidden: [],
  },
};

export function isBentoPresetName(value: string): value is BentoPresetName {
  return (BENTO_PRESET_NAMES as readonly string[]).includes(value);
}

function allCardIds(specs: readonly BentoCardSpec[]): string[] {
  return specs.map((spec) => spec.id);
}

function specById(specs: readonly BentoCardSpec[], id: string): BentoCardSpec | undefined {
  return specs.find((spec) => spec.id === id);
}

function safeSize(spec: BentoCardSpec, candidate?: BentoCardSize): BentoCardSize {
  if (candidate && spec.allowedSizes.includes(candidate)) return candidate;
  if (spec.allowedSizes.includes(spec.defaultSize)) return spec.defaultSize;
  return spec.allowedSizes[0] ?? spec.defaultSize;
}

function buildSizeMap(
  specs: readonly BentoCardSpec[],
  candidates: Partial<Record<string, BentoCardSize>> = {},
): Record<string, BentoCardSize> {
  const out: Record<string, BentoCardSize> = {};
  specs.forEach((spec) => {
    const candidate = candidates[spec.id];
    out[spec.id] = safeSize(spec, candidate);
  });
  return out;
}

function cloneResolved(layout: ResolvedBentoLayout): ResolvedBentoLayout {
  return {
    order: layout.order.slice(),
    size: { ...layout.size },
    hidden: layout.hidden.slice(),
  };
}

/**
 * Drops unknown ids, removes duplicates, appends every missing id and keeps
 * the requested trailing ids (the Home rail pair) at the very end.
 */
export function normalizeBentoOrder(
  order: readonly string[],
  allIds: readonly string[],
  trailingIds: readonly string[] = [],
): string[] {
  const known = new Set(allIds);
  const seen = new Set<string>();
  const cleaned: string[] = [];

  order.forEach((id) => {
    if (known.has(id) && !seen.has(id)) {
      cleaned.push(id);
      seen.add(id);
    }
  });

  const missing = allIds.filter((id) => !seen.has(id));
  if (missing.length) {
    const tail: string[] = [];
    while (cleaned.length) {
      const last = cleaned[cleaned.length - 1];
      if (last !== undefined && trailingIds.includes(last)) {
        tail.unshift(cleaned.pop() as string);
      } else {
        break;
      }
    }
    cleaned.push(...missing, ...tail);
  }

  return cleaned;
}

/** Filters to known ids, removes duplicates and preserves hidden order. */
export function normalizeBentoHidden(
  hidden: readonly string[],
  allIds: readonly string[],
): string[] {
  const known = new Set(allIds);
  const seen = new Set<string>();
  const out: string[] = [];
  hidden.forEach((id) => {
    if (known.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  });
  return out;
}

export function visibleBentoOrder(layout: ResolvedBentoLayout): string[] {
  const hidden = new Set(layout.hidden);
  return layout.order.filter((id) => !hidden.has(id));
}

/**
 * Resolves a saved layout. An empty/unknown order falls back to the
 * profile preset, so presets genuinely drive first-run defaults.
 */
export function resolveBentoLayout(
  layout: BentoLayoutInput,
  specs: readonly BentoCardSpec[],
  presetName: string,
  trailingIds: readonly string[] = [],
): ResolvedBentoLayout {
  const ids = allCardIds(specs);
  const known = new Set(ids);
  const hasStoredOrder = Array.isArray(layout.order) && layout.order.some((id) => known.has(id));

  if (!hasStoredOrder) {
    return applyBentoPreset(isBentoPresetName(presetName) ? presetName : 'balanced', specs);
  }

  return {
    order: normalizeBentoOrder(layout.order, ids, trailingIds),
    size: buildSizeMap(specs, layout.size),
    hidden: normalizeBentoHidden(layout.hidden, ids),
  };
}

/** Applies a named preset and fills any registry ids the preset omits. */
export function applyBentoPreset(
  name: BentoPresetName,
  specs: readonly BentoCardSpec[],
  trailingIds: readonly string[] = [],
): ResolvedBentoLayout {
  const ids = allCardIds(specs);
  const preset = BENTO_PRESETS[name];
  const baseOrder = preset.order.length ? preset.order : ids;

  return {
    order: normalizeBentoOrder(baseOrder, ids, trailingIds),
    size: buildSizeMap(specs, preset.size),
    hidden: normalizeBentoHidden(preset.hidden, ids),
  };
}

/** Moves a card earlier/later in the visible order, jumping hidden cards. */
export function moveBentoCard(
  layout: ResolvedBentoLayout,
  id: string,
  delta: number,
): ResolvedBentoLayout {
  const visible = visibleBentoOrder(layout);
  const from = visible.indexOf(id);
  if (from < 0 || delta === 0) return cloneResolved(layout);

  const to = Math.max(0, Math.min(visible.length - 1, from + delta));
  if (to === from) return cloneResolved(layout);

  const other = visible[to];
  if (!other) return cloneResolved(layout);

  const order = layout.order.slice();
  const sourceIndex = order.indexOf(id);
  if (sourceIndex < 0) return cloneResolved(layout);
  order.splice(sourceIndex, 1);

  const otherIndex = order.indexOf(other);
  if (otherIndex < 0) return cloneResolved(layout);
  order.splice(delta < 0 ? otherIndex : otherIndex + 1, 0, id);

  return { ...cloneResolved(layout), order };
}

/** Inserts a card immediately before `beforeId`, or after the last visible card. */
export function placeBentoCard(
  layout: ResolvedBentoLayout,
  id: string,
  beforeId: string | null,
): ResolvedBentoLayout {
  const order = layout.order.slice();
  const sourceIndex = order.indexOf(id);
  if (sourceIndex >= 0) order.splice(sourceIndex, 1);

  const targetIndex = beforeId ? order.indexOf(beforeId) : -1;
  if (targetIndex >= 0) {
    order.splice(targetIndex, 0, id);
  } else {
    const hidden = new Set(layout.hidden);
    let insertAt = order.length;
    while (insertAt > 0) {
      const candidate = order[insertAt - 1];
      if (candidate !== undefined && hidden.has(candidate)) insertAt--;
      else break;
    }
    order.splice(insertAt, 0, id);
  }

  return { ...cloneResolved(layout), order };
}

export function setBentoSize(
  layout: ResolvedBentoLayout,
  id: string,
  size: BentoCardSize,
  specs: readonly BentoCardSpec[],
): ResolvedBentoLayout {
  const spec = specById(specs, id);
  if (!spec || !spec.allowedSizes.includes(size)) return cloneResolved(layout);
  return { ...cloneResolved(layout), size: { ...layout.size, [id]: size } };
}

/** Cycles to the next allowed size for keyboard resize support. */
export function nextBentoSize(
  size: BentoCardSize,
  spec: BentoCardSpec,
): BentoCardSize {
  const current = spec.allowedSizes.indexOf(size);
  if (current < 0) return safeSize(spec, size);
  const next = spec.allowedSizes[(current + 1) % spec.allowedSizes.length];
  return next ?? safeSize(spec, size);
}

/** Snaps an arbitrary column span to the nearest allowed size. */
export function snapBentoSize(
  span: number,
  spec: BentoCardSpec,
): BentoCardSize {
  const allowed = spec.allowedSizes.length ? spec.allowedSizes : [spec.defaultSize];
  let best = allowed[0] ?? spec.defaultSize;
  allowed.forEach((size) => {
    const bestDistance = Math.abs(BENTO_SIZE_SPAN[best] - span);
    const sizeDistance = Math.abs(BENTO_SIZE_SPAN[size] - span);
    if (sizeDistance < bestDistance) best = size;
  });
  return best;
}

export function hideBentoCard(
  layout: ResolvedBentoLayout,
  id: string,
): ResolvedBentoLayout {
  if (layout.hidden.includes(id)) return cloneResolved(layout);
  return { ...cloneResolved(layout), hidden: [...layout.hidden.filter((x) => x !== id), id] };
}

export function showBentoCard(
  layout: ResolvedBentoLayout,
  id: string,
  specs: readonly BentoCardSpec[],
): ResolvedBentoLayout {
  if (!specById(specs, id)) return cloneResolved(layout);
  return { ...cloneResolved(layout), hidden: layout.hidden.filter((x) => x !== id) };
}

export function emptyBentoLayout(): BentoLayoutInput {
  return { order: [], size: {}, hidden: [] };
}

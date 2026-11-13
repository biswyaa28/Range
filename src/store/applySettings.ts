import { resolveAccent } from '@/domain/color';
import type {
  AnimationLevel,
  ClockFormat,
  Density,
  FontPreference,
  Settings,
  TimetableBlockColors,
  WeekStart,
} from '@/domain/settings';
import { isHexColor } from '@/domain/settings';

const FONT_STACKS: Record<FontPreference, string> = {
  system:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Google Sans", "Segoe UI", Roboto, Inter, sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace',
};

const DENSITY_VALUES: Record<Density, { space: string; gap: string; pad: string }> = {
  compact: { space: '14px', gap: '14px', pad: '14px' },
  comfortable: { space: '16px', gap: '20px', pad: '20px' },
  spacious: { space: '18px', gap: '26px', pad: '24px' },
};

const MOTION_VALUES: Record<
  AnimationLevel,
  { scale: string; fast: string; base: string; slow: string; press: string }
> = {
  full: {
    scale: '1',
    fast: '150ms',
    base: '300ms',
    slow: '500ms',
    press: '0.35s',
  },
  reduced: {
    scale: '0.5',
    fast: '80ms',
    base: '160ms',
    slow: '250ms',
    press: '0.18s',
  },
  off: {
    scale: '0',
    fast: '0ms',
    base: '0ms',
    slow: '0ms',
    press: '0s',
  },
};

const BLOCK_COLOR_KEY = /^[a-z][a-z0-9-]{0,31}$/i;

export interface ApplySettingsOptions {
  /** Defaults to `document.documentElement`. */
  root?: HTMLElement;
  /** Overrides the system preference when `theme` is `system`. */
  prefersDark?: boolean;
}

function systemPrefersDark(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function clearBlockColors(root: HTMLElement): void {
  const style = root.style;
  for (let index = style.length - 1; index >= 0; index--) {
    const name = style.item(index);
    if (name.startsWith('--block-')) style.removeProperty(name);
  }
}

function applyBlockColors(root: HTMLElement, colors: TimetableBlockColors): void {
  clearBlockColors(root);
  const style = root.style;

  for (const [key, value] of Object.entries(colors)) {
    if (!BLOCK_COLOR_KEY.test(key) || !isHexColor(value)) continue;
    style.setProperty(`--block-${key.toLowerCase()}`, value.toLowerCase());
  }
}

function applyWeekStart(root: HTMLElement, weekStart: WeekStart): void {
  root.dataset['weekStart'] = String(weekStart);
}

function applyClockFormat(root: HTMLElement, clockFormat: ClockFormat): void {
  root.dataset['clock'] = clockFormat;
}

/**
 * Projects settings onto the document as CSS variables and data attributes.
 *
 * Used explicitly by the app shell (or a future settings surface); the store
 * itself never touches the document so it stays testable in isolation.
 */
export function applySettings(
  settings: Settings,
  options: ApplySettingsOptions = {},
): void {
  const root =
    options.root ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!root) return;

  const prefersDark = options.prefersDark ?? systemPrefersDark();
  const isDark =
    settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);

  root.dataset['theme'] = isDark ? 'dark' : 'light';
  root.dataset['font'] = settings.font;
  root.dataset['density'] = settings.density;
  root.dataset['motion'] = settings.animation;
  root.dataset['haptics'] = settings.haptics ? 'on' : 'off';

  const style = root.style;
  const customAccent =
    settings.accentColor === 'custom' ? settings.accentCustom : undefined;
  const accent = resolveAccent(settings.accentColor, customAccent, isDark);
  style.setProperty('--accent', accent.accent);
  style.setProperty('--accent-text', accent.accentText);
  style.setProperty('--on-accent', accent.onAccent);
  style.setProperty('--focus', accent.focus);

  const fontStack = FONT_STACKS[settings.font];
  style.setProperty('--font-ui', fontStack);
  style.setProperty('--sans', fontStack);

  const density = DENSITY_VALUES[settings.density];
  style.setProperty('--space-unit', density.space);
  style.setProperty('--gap', density.gap);
  style.setProperty('--density-pad', density.pad);

  const radius = Math.round(settings.cornerRadius);
  style.setProperty('--radius-base', `${radius}px`);
  style.setProperty('--r-card', `${radius}px`);
  style.setProperty('--r-input', `${Math.max(0, radius - 8)}px`);
  style.setProperty('--r-modal', `${radius + 8}px`);

  const motion = MOTION_VALUES[settings.animation];
  style.setProperty('--motion-scale', motion.scale);
  style.setProperty('--dur-fast', motion.fast);
  style.setProperty('--dur-base', motion.base);
  style.setProperty('--dur-slow', motion.slow);
  style.setProperty('--press-dur', motion.press);

  applyBlockColors(root, settings.timetableColors);
  applyWeekStart(root, settings.weekStart);
  applyClockFormat(root, settings.clockFormat);
}

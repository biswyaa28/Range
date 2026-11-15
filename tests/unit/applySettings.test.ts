import { describe, it, expect } from 'vitest';
import { defaultSettings, normalizeSettings } from '@/domain/settings';
import { applySettings } from '@/store/applySettings';

function makeRoot(): HTMLElement {
  return document.createElement('div');
}

describe('applySettings', () => {
  it('projects theme, accent, typography, density, radius and motion to CSS variables', () => {
    const root = makeRoot();
    const settings = normalizeSettings({
      theme: 'system',
      accentColor: 'blue',
      font: 'serif',
      density: 'compact',
      cornerRadius: 24,
      animation: 'reduced',
      haptics: false,
      weekStart: 0,
      clockFormat: '12h',
    });

    applySettings(settings, { root, prefersDark: true });

    expect(root.dataset['theme']).toBe('dark');
    expect(root.dataset['font']).toBe('serif');
    expect(root.dataset['density']).toBe('compact');
    expect(root.dataset['motion']).toBe('reduced');
    expect(root.dataset['haptics']).toBe('off');
    expect(root.dataset['weekStart']).toBe('0');
    expect(root.dataset['clock']).toBe('12h');

    expect(root.style.getPropertyValue('--accent')).toBe('#0A84FF');
    expect(root.style.getPropertyValue('--accent-text')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(root.style.getPropertyValue('--on-accent')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(root.style.getPropertyValue('--focus')).toBe('#0a84ff');

    expect(root.style.getPropertyValue('--font-ui')).toContain('Georgia');
    expect(root.style.getPropertyValue('--sans')).toContain('Georgia');

    expect(root.style.getPropertyValue('--space-unit')).toBe('14px');
    expect(root.style.getPropertyValue('--gap')).toBe('14px');
    expect(root.style.getPropertyValue('--density-pad')).toBe('14px');

    expect(root.style.getPropertyValue('--radius-base')).toBe('24px');
    expect(root.style.getPropertyValue('--r-card')).toBe('24px');
    expect(root.style.getPropertyValue('--r-input')).toBe('16px');
    expect(root.style.getPropertyValue('--r-modal')).toBe('32px');

    expect(root.style.getPropertyValue('--motion-scale')).toBe('0.5');
    expect(root.style.getPropertyValue('--dur-fast')).toBe('80ms');
    expect(root.style.getPropertyValue('--dur-base')).toBe('160ms');
    expect(root.style.getPropertyValue('--dur-slow')).toBe('250ms');
    expect(root.style.getPropertyValue('--press-dur')).toBe('0.18s');
  });

  it('honours explicit light and dark themes over the system preference', () => {
    const root = makeRoot();

    applySettings(normalizeSettings({ theme: 'light' }), {
      root,
      prefersDark: true,
    });
    expect(root.dataset['theme']).toBe('light');
    expect(root.style.getPropertyValue('--accent')).toBe('#1D1D1F');

    applySettings(normalizeSettings({ theme: 'dark' }), {
      root,
      prefersDark: false,
    });
    expect(root.dataset['theme']).toBe('dark');
    expect(root.style.getPropertyValue('--accent')).toBe('#F5F5F7');
    expect(root.style.getPropertyValue('--font-ui')).toContain('-apple-system');
    expect(root.style.getPropertyValue('--r-card')).toBe('20px');
    expect(root.style.getPropertyValue('--r-input')).toBe('12px');
    expect(root.style.getPropertyValue('--r-modal')).toBe('28px');
    expect(root.style.getPropertyValue('--press-dur')).toBe('0.35s');
  });

  it('maps animation off to zero-duration tokens', () => {
    const root = makeRoot();
    applySettings(normalizeSettings({ animation: 'off' }), { root });

    expect(root.dataset['motion']).toBe('off');
    expect(root.style.getPropertyValue('--motion-scale')).toBe('0');
    expect(root.style.getPropertyValue('--dur-fast')).toBe('0ms');
    expect(root.style.getPropertyValue('--dur-base')).toBe('0ms');
    expect(root.style.getPropertyValue('--dur-slow')).toBe('0ms');
    expect(root.style.getPropertyValue('--press-dur')).toBe('0s');
  });

  it('writes timetable colors as per-category block variables and clears stale ones', () => {
    const root = makeRoot();
    root.style.setProperty('--block-stale', '#ffffff');

    const settings = normalizeSettings({
      timetableColors: {
        class: '#123456',
        study: 'not-a-color',
        party: '#ABCDEF',
        'bad key': '#ffffff',
      },
    });

    applySettings(settings, { root });

    expect(root.style.getPropertyValue('--block-class')).toBe('#123456');
    expect(root.style.getPropertyValue('--block-study')).toBe('#8b7bff');
    expect(root.style.getPropertyValue('--block-party')).toBe('#abcdef');
    expect(root.style.getPropertyValue('--block-bad key')).toBe('');
    expect(root.style.getPropertyValue('--block-stale')).toBe('');
  });

  it('is idempotent for repeated application', () => {
    const root = makeRoot();
    const settings = defaultSettings();

    applySettings(settings, { root, prefersDark: false });
    const first = root.style.cssText;
    applySettings(settings, { root, prefersDark: false });

    expect(root.style.cssText).toBe(first);
    expect(root.dataset['theme']).toBe('light');
  });
});

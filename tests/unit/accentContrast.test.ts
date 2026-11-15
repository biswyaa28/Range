import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  contrastRatio,
  focusColor,
  hexToRGB,
  resolveAccent,
  textOnAccent,
} from '@/domain/color';

const LIGHT_PAGE: [number, number, number] = [255, 255, 255];
const DARK_PAGE: [number, number, number] = [10, 10, 11];
const LIGHT_SURFACE: [number, number, number] = [245, 245, 247];
const DARK_SURFACE: [number, number, number] = [28, 28, 30];

const presets = ACCENTS.filter((accent) => accent.hex !== null);

describe.each([
  { theme: 'light', dark: false, page: LIGHT_PAGE, surface: LIGHT_SURFACE },
  { theme: 'dark', dark: true, page: DARK_PAGE, surface: DARK_SURFACE },
] as const)('$theme accent contrast', ({ dark, page, surface }) => {
  it.each(presets)('$label meets text, icon and focus ratios', (accent) => {
    const applied = resolveAccent(accent.id, undefined, dark);
    const accentRGB = hexToRGB(applied.accent);

    // Accent used as text/icons needs 4.5:1; on a tinted surface too.
    expect(contrastRatio(hexToRGB(applied.accentText), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexToRGB(applied.accentText), page)).toBeGreaterThanOrEqual(4.5);

    // Label on a filled accent button.
    expect(contrastRatio(hexToRGB(applied.onAccent), accentRGB)).toBeGreaterThanOrEqual(4.5);
    expect(applied.onAccent).toBe(textOnAccent(applied.accent));

    // Focus ring and other non-text UI need 3:1 against the page.
    expect(contrastRatio(hexToRGB(applied.focus), page)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(hexToRGB(focusColor(applied.accent, dark)), page)).toBeGreaterThanOrEqual(3);
  });
});

describe('nfocus ring darkening', () => {
  it('leaves dark-theme vivid accents untouched and darkens pale light-theme ones', () => {
    expect(focusColor('#30D5C8', true)).toBe('#30d5c8');
    expect(focusColor('#30D5C8', false)).not.toBe('#30d5c8');
    expect(focusColor('#FFFFFF', false)).not.toBe('#ffffff');
  });
});

describe('green completion check', () => {
  it('uses a dark check that clears 3:1 on the green fill in both themes', () => {
    for (const green of ['#34C759', '#30D158']) {
      expect(contrastRatio([10, 10, 11], hexToRGB(green))).toBeGreaterThanOrEqual(3);
      // White would fail, which is why the glyph is dark.
      expect(contrastRatio([255, 255, 255], hexToRGB(green))).toBeLessThan(3);
    }
  });
});

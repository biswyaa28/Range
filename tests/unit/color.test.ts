import { describe, it, expect } from 'vitest';
import {
  ACCENTS,
  hexToRGB,
  relativeLuminance,
  contrastRatio,
  accentText,
  textOnAccent,
  resolveAccent,
} from '@/domain/color';

describe('domain color & contrast helpers', () => {
  it('converts hex to RGB', () => {
    expect(hexToRGB('#FFFFFF')).toEqual([255, 255, 255]);
    expect(hexToRGB('#000000')).toEqual([0, 0, 0]);
    expect(hexToRGB('0A84FF')).toEqual([10, 132, 255]);
    expect(hexToRGB('#fff')).toEqual([255, 255, 255]);
  });

  it('calculates relative luminance and contrast ratio', () => {
    const whiteLum = relativeLuminance([255, 255, 255]);
    const blackLum = relativeLuminance([0, 0, 0]);
    expect(whiteLum).toBe(1);
    expect(blackLum).toBe(0);

    const contrast = contrastRatio([255, 255, 255], [0, 0, 0]);
    expect(contrast).toBeCloseTo(21, 1);
  });

  it('picks AA >= 4.5:1 accentText for all 8 presets in light and dark mode', () => {
    for (const acc of ACCENTS) {
      const hex = acc.hex || '#1D1D1F';
      const textLight = accentText(hex, false);
      const textDark = accentText(hex, true);

      expect(textLight).toMatch(/^#[0-9a-f]{6}$/i);
      expect(textDark).toMatch(/^#[0-9a-f]{6}$/i);

      const lightBg: [number, number, number] = [245, 245, 247];
      const darkBg: [number, number, number] = [10, 10, 11];

      const cLight = contrastRatio(hexToRGB(textLight), lightBg);
      const cDark = contrastRatio(hexToRGB(textDark), darkBg);

      expect(cLight).toBeGreaterThanOrEqual(4.5);
      expect(cDark).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('picks appropriate textOnAccent (black or white) for high legibility', () => {
    expect(textOnAccent('#FFFFFF')).toBe('#0A0A0B');
    expect(textOnAccent('#000000')).toBe('#FFFFFF');
    // Against #0A84FF (relLum ~0.26), contrast with dark [10,10,11] is 5.43 vs white [255,255,255] is 3.65
    expect(textOnAccent('#0A84FF')).toBe('#0A0A0B');
    expect(textOnAccent('#A3E635')).toBe('#0A0A0B'); // Bright lime needs dark text
  });

  it('resolves custom accents and fallback defaults', () => {
    const custom = resolveAccent('custom', '#3b82f6', false);
    expect(custom.accent).toBe('#3b82f6');
    expect(custom.focus).toBe('#3b82f6');

    const monoLight = resolveAccent('mono', undefined, false);
    expect(monoLight.accent).toBe('#1D1D1F');

    const monoDark = resolveAccent('mono', undefined, true);
    expect(monoDark.accent).toBe('#F5F5F7');
  });
});


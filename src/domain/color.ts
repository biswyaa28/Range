export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface AccentDefinition {
  id: string;
  label: string;
  hex: string | null;
}

export const ACCENTS: AccentDefinition[] = [
  { id: 'mono', label: 'Mono', hex: null },
  { id: 'blue', label: 'Blue', hex: '#0A84FF' },
  { id: 'violet', label: 'Violet', hex: '#8B7BFF' },
  { id: 'pink', label: 'Pink', hex: '#FF5E9C' },
  { id: 'orange', label: 'Orange', hex: '#FF9F0A' },
  { id: 'teal', label: 'Teal', hex: '#30D5C8' },
  { id: 'lime', label: 'Lime', hex: '#A3E635' },
  { id: 'red', label: 'Red', hex: '#FF453A' },
];

export function hexToRGB(hexStr: string): [number, number, number] {
  let h = String(hexStr).replace('#', '');
  if (h.length === 3) {
    h = h.replace(/./g, '$&$&');
  }
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(rgb: [number, number, number]): number {
  const f = (val: number): number => {
    const v = val / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

export function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const x = relativeLuminance(rgb1);
  const y = relativeLuminance(rgb2);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/**
 * Nudges accent colour toward the background or foreground until WCAG AA >= 4.5:1.
 * Matches legacy applyAccent algorithm exactly.
 */
export function accentText(hex: string, isDark: boolean): string {
  const rgb = hexToRGB(hex);
  const bg: [number, number, number] = isDark ? [10, 10, 11] : [245, 245, 247];
  const fg: [number, number, number] = isDark ? [245, 245, 247] : [29, 29, 31];

  let t: [number, number, number] = [rgb[0], rgb[1], rgb[2]];
  let k = 0;
  while (contrastRatio(t, bg) < 4.5 && k < 20) {
    k++;
    t = [
      t[0] + (fg[0] - t[0]) * 0.12,
      t[1] + (fg[1] - t[1]) * 0.12,
      t[2] + (fg[2] - t[2]) * 0.12,
    ];
  }
  return rgbToHex(t);
}

/**
 * Focus rings need 3:1 against the page. Light accents such as lime and teal
 * are darkened toward the foreground until they reach it.
 */
export function focusColor(hex: string, isDark: boolean): string {
  const rgb = hexToRGB(hex);
  const bg: [number, number, number] = isDark ? [10, 10, 11] : [255, 255, 255];
  const fg: [number, number, number] = isDark ? [245, 245, 247] : [29, 29, 31];

  let t: [number, number, number] = [rgb[0], rgb[1], rgb[2]];
  let k = 0;
  while (contrastRatio(t, bg) < 3 && k < 20) {
    k++;
    t = [
      t[0] + (fg[0] - t[0]) * 0.14,
      t[1] + (fg[1] - t[1]) * 0.14,
      t[2] + (fg[2] - t[2]) * 0.14,
    ];
  }
  return rgbToHex(t);
}

/**
 * Selects whether black or white text has higher contrast against the accent background.
 */
export function textOnAccent(hex: string): '#0A0A0B' | '#FFFFFF' {
  const rgb = hexToRGB(hex);
  const darkContrast = contrastRatio([10, 10, 11], rgb);
  const lightContrast = contrastRatio([255, 255, 255], rgb);
  return darkContrast >= lightContrast ? '#0A0A0B' : '#FFFFFF';
}

export interface AppliedAccent {
  accent: string;
  accentText: string;
  onAccent: string;
  focus: string;
}

export function resolveAccent(
  accentId: string,
  customAccent: string | undefined,
  isDark: boolean,
): AppliedAccent {
  const found = ACCENTS.find((a) => a.id === accentId);
  let hex = found ? found.hex : null;
  if (!hex && customAccent && /^#[0-9a-f]{6}$/i.test(customAccent)) {
    hex = customAccent;
  }
  if (!hex) {
    hex = isDark ? '#F5F5F7' : '#1D1D1F';
  }

  const accText = accentText(hex, isDark);
  const onAcc = textOnAccent(hex);

  return {
    accent: hex,
    accentText: accText,
    onAccent: onAcc,
    focus: focusColor(hex, isDark),
  };
}


import { describe, expect, it } from 'vitest';
import { isMacPlatform, shortcutKey, shortcutKeys } from '@/lib/shortcutLabels';

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

describe('shortcut labels', () => {
  it('detects macOS', () => {
    expect(isMacPlatform(MAC_UA)).toBe(true);
    expect(isMacPlatform(WINDOWS_UA)).toBe(false);
  });

  it('shows ⌘ on macOS and Ctrl elsewhere', () => {
    expect(shortcutKey('Ctrl', true)).toBe('⌘');
    expect(shortcutKey('Ctrl', false)).toBe('Ctrl');
    expect(shortcutKeys(['Ctrl', 'K'], true)).toEqual(['⌘', 'K']);
    expect(shortcutKeys(['Ctrl', 'K'], false)).toEqual(['Ctrl', 'K']);
  });

  it('leaves other keys alone', () => {
    expect(shortcutKey('Esc', true)).toBe('Esc');
    expect(shortcutKey('Shift', false)).toBe('Shift');
  });
});

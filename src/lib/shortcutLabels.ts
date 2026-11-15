/** macOS shows ⌘; everything else shows Ctrl. */
export function isMacPlatform(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): boolean {
  return /Macintosh|Mac OS X/i.test(userAgent);
}

/** Map the portable `Ctrl` token to the platform's primary modifier glyph. */
export function shortcutKey(key: string, mac: boolean = isMacPlatform()): string {
  if (key === 'Ctrl') return mac ? '⌘' : 'Ctrl';
  return key;
}

export function shortcutKeys(keys: string[], mac: boolean = isMacPlatform()): string[] {
  return keys.map((key) => shortcutKey(key, mac));
}

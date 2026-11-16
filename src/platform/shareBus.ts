let pending: string | null = null;

/** Called by the Capacitor bridge, including the cold-start share intent. */
export function pushSharedText(text: string): void {
  const value = String(text ?? '').trim();
  if (!value) return;
  pending = value;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('personalos:share-text', { detail: value }));
  }
}

/** Takes the cold-start share exactly once; warm shares arrive by event. */
export function takeSharedText(): string | null {
  const value = pending;
  pending = null;
  return value;
}

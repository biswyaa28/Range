import { pushSharedText } from './shareBus';

interface AndroidWidgetBridge {
  consumeSharedText?: () => string | null;
  updateSnapshot?: (json: string) => void;
}

export function androidBridge(): AndroidWidgetBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as unknown as { AndroidWidget?: AndroidWidgetBridge }).AndroidWidget;
  return bridge ?? null;
}

/** Reads a share that launched the app before React mounted. */
export function initAndroidShare(): void {
  const bridge = androidBridge();
  if (!bridge?.consumeSharedText) return;
  try {
    const text = bridge.consumeSharedText();
    if (text) pushSharedText(text);
  } catch {
    // A missing native bridge only means share-target is unavailable.
  }
}

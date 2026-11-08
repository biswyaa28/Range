/**
 * Tiny external store that lets any surface (F key, Focus tab button, palette)
 * open the single app-level Focus Mode overlay.
 */
let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}

export function openFocusMode(): void {
  if (open) return;
  open = true;
  emit();
}

export function closeFocusMode(): void {
  if (!open) return;
  open = false;
  emit();
}

export function isFocusModeOpen(): boolean {
  return open;
}

export function subscribeFocusMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

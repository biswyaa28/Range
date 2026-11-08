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

export function openPalette(): void {
  if (open) return;
  open = true;
  emit();
}

export function closePalette(): void {
  if (!open) return;
  open = false;
  emit();
}

export function isPaletteOpen(): boolean {
  return open;
}

export function subscribePalette(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

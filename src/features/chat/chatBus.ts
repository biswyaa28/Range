/**
 * App-level AI chat surface. Kept outside React state so the top nav, Android
 * back handling and future shortcuts can open the same panel.
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

export function openChat(): void {
  if (open) return;
  open = true;
  emit();
}

export function closeChat(): void {
  if (!open) return;
  open = false;
  emit();
}

export function isChatOpen(): boolean {
  return open;
}

export function subscribeChat(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

import { useCallback, useSyncExternalStore } from 'react';
import type { AppState } from '@/domain/types';
import { store as defaultStore, PersonalStore } from './store';

/**
 * React hook using useSyncExternalStore to subscribe to state updates in PersonalStore.
 *
 * Selectors must return a stable reference (a primitive or a stored object).
 * Returning a fresh object on every read would make React re-render forever.
 */
export function useStore<T = AppState>(
  selector: (state: AppState) => T = (s) => s as unknown as T,
  customStore: PersonalStore = defaultStore,
): T {
  // Stable identities stop React from tearing down the subscription on every render.
  const subscribe = useCallback(
    (onStoreChange: () => void) => customStore.subscribe(() => onStoreChange()),
    [customStore],
  );
  const getSnapshot = useCallback(
    () => selector(customStore.get()),
    [selector, customStore],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}


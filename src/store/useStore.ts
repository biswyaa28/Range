import { useSyncExternalStore } from 'react';
import type { AppState } from '@/domain/types';
import { store as defaultStore, PersonalStore } from './store';

/**
 * React hook using useSyncExternalStore to subscribe to state updates in PersonalStore.
 */
export function useStore<T = AppState>(
  selector: (state: AppState) => T = (s) => s as unknown as T,
  customStore: PersonalStore = defaultStore,
): T {
  return useSyncExternalStore(
    (onStoreChange) => customStore.subscribe(() => onStoreChange()),
    () => selector(customStore.get()),
    () => selector(customStore.get()),
  );
}


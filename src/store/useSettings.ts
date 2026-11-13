import { useCallback, useSyncExternalStore } from 'react';
import type { Settings } from '@/domain/settings';
import { settingsStore, SettingsStore } from './settingsStore';

/**
 * Subscribes to the versioned settings store.
 *
 * Selectors should return stable references (a primitive or a stored object)
 * to avoid unnecessary renders, matching `useStore` elsewhere in the app.
 */
export function useSettings<T = Settings>(
  selector: (settings: Settings) => T = (settings) => settings as unknown as T,
  customStore: SettingsStore = settingsStore,
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

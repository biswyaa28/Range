import { useEffect, useSyncExternalStore } from 'react';
import { aiKeyStore, type AiKeyState, type AiKeyStore } from './aiKeyStore';

export interface UseAiKeyResult extends AiKeyState {
  hasKey: boolean;
  setKey: (value: string) => Promise<void>;
  clear: () => Promise<void>;
}

export function useAiKey(store: AiKeyStore = aiKeyStore): UseAiKeyResult {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);

  useEffect(() => {
    void store.load();
  }, [store]);

  return {
    ...state,
    hasKey: state.key.length > 0,
    setKey: store.setKey,
    clear: store.clear,
  };
}

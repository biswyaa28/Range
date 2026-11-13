import { useSyncExternalStore } from 'react';
import { syncEngine } from './index';
import type { SyncEngine } from './engine';
import type { DeleteProgress, SyncState } from './types';

export interface UseSyncResult {
  state: SyncState;
  signIn: () => Promise<void>;
  cancelSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  deleteCloudData: (onProgress?: (progress: DeleteProgress) => void) => Promise<void>;
}

/** Subscribes a component to the sync engine status and actions. */
export function useSync(engine: SyncEngine = syncEngine): UseSyncResult {
  const state = useSyncExternalStore(
    (onStoreChange) => engine.subscribe(() => onStoreChange()),
    () => engine.getState(),
    () => engine.getState(),
  );

  return {
    state,
    signIn: () => engine.signIn(),
    cancelSignIn: () => engine.cancelSignIn(),
    signOut: () => engine.signOut(),
    syncNow: () => engine.syncNow(),
    deleteCloudData: (onProgress) => engine.deleteCloudData(onProgress),
  };
}

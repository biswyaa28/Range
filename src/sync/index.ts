import { storage } from '@/platform';
import { googleAuth } from '@/platform/googleAuth';
import { store } from '@/store';
import { settingsStore } from '@/store/settingsStore';
import { SyncEngine } from './engine';
import { FirebaseAdapter } from './firebaseAdapter';
import { firebaseConfig } from './firebaseConfig';

export const syncEngine = new SyncEngine({
  adapter: firebaseConfig
    ? new FirebaseAdapter(firebaseConfig, {
        getGoogleCredential: googleAuth.getCredential,
        cancelSignIn: googleAuth.cancel,
        signOutNative: googleAuth.signOutNative,
      })
    : null,
  store,
  settings: settingsStore,
  storage,
});

export { SyncEngine } from './engine';
export type { SyncEngineOptions } from './engine';
export { redactPreferences, mergePreferences } from './preferences';
export type {
  RemoteSnapshot,
  SyncAccount,
  SyncAdapter,
  SyncPush,
  SyncState,
  SyncStatus,
  SyncedPreferences,
} from './types';

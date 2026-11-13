import type { AppState, DayStats } from '@/domain/types';
import type { Settings } from '@/domain/settings';

/** Signed-in identity exposed to the UI and adapters. */
export interface SyncAccount {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/** Preferences are safe to sync; the AI key lives only in secure storage. */
export type SyncedPreferences = Settings;

/** Everything a remote store can return in one pull. */
export interface RemoteSnapshot {
  blocks: unknown[];
  tasks: unknown[];
  notes: unknown[];
  deadlines: unknown[];
  profile: unknown | null;
  layout: unknown | null;
  /** Legacy `AppState.settings` group. */
  appSettings: unknown | null;
  dayStats: Record<string, DayStats> | null;
  /** Versioned preferences, never containing `ai.apiKey`. */
  preferences: unknown | null;
}

/** Only changed records and singletons are sent on each push. */
export interface SyncPush {
  blocks: AppState['blocks'];
  tasks: AppState['tasks'];
  notes: AppState['notes'];
  deadlines: AppState['deadlines'];
  profile: AppState['profile'] | null;
  layout: AppState['layout'] | null;
  appSettings: AppState['settings'] | null;
  dayStats: Record<string, DayStats>;
  preferences: SyncedPreferences | null;
}

export interface SyncPullOptions {
  /**
   * Optional ISO-8601 cursor for incremental record queries (`updatedAt > since`).
   * When omitted or null, the adapter fetches all records in every collection.
   */
  since?: string | null;
}

export interface DeleteProgress {
  /** Documents deleted so far. */
  deleted: number;
  /** Known after the remote listing; null while it is still being counted. */
  total: number | null;
}

export interface SyncDeleteOptions {
  onProgress?: (progress: DeleteProgress) => void;
}

/** A record too large to push; sync skips it instead of failing the batch. */
export interface UnsyncableRecord {
  collection: 'blocks' | 'tasks' | 'notes' | 'deadlines';
  id: string;
  title: string;
  bytes: number;
}

export interface SyncPushOptions {
  /**
   * Invoked after each committed batch in a multi-batch push so the engine can
   * remember partial progress if a later batch fails.
   */
  onChunkCommitted?: (chunk: SyncPush) => void;
}

export type SyncStatus =
  | 'disabled'
  | 'signed-out'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error';

export interface SyncState {
  /** False when no adapter is configured for this build. */
  configured: boolean;
  status: SyncStatus;
  account: SyncAccount | null;
  lastSyncedAt: string | null;
  /** Local records or preferences newer than the last successful sync. */
  pending: boolean;
  error: string | null;
  /** Non-fatal informational notice from the last sync (e.g. trimmed stats). */
  notice?: string | null;
  /** Records this device skipped because they exceed the size limit. */
  unsyncable?: UnsyncableRecord[];
}

/**
 * Vendor boundary. Implementations own authentication and transport only;
 * merge, cursors, tombstones and status live in the engine.
 */
export interface SyncAdapter {
  readonly kind: string;
  subscribeAuth(
    listener: (account: SyncAccount | null) => void,
    onError?: (error: unknown) => void,
  ): () => void;
  signInWithGoogle(): Promise<void>;
  /** Aborts an in-flight native sign-in when the flow supports it. */
  cancelSignIn?(): Promise<void>;
  signOut(): Promise<void>;
  pull(account: SyncAccount, options?: SyncPullOptions): Promise<RemoteSnapshot>;
  push(account: SyncAccount, changes: SyncPush, options?: SyncPushOptions): Promise<void>;
  /**
   * Permanently removes every document this app stores for the account
   * (record collections and `state/*`). Optional: local-only adapters omit it.
   */
  deleteAllData?(account: SyncAccount, options?: SyncDeleteOptions): Promise<void>;
}

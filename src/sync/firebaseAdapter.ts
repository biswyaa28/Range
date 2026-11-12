import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { DayStats } from '@/domain/types';
import type { GoogleCredential } from '@/platform/googleAuth';
import type { FirebaseConfig } from './firebaseConfig';
import { planPushBatches, writesDayStats, writesStateApp } from './batching';
import { buildStateAppPayload } from './appPayload';
import { withTombstoneExpiry } from '@/domain/tombstone';
import type {
  RemoteSnapshot,
  SyncAccount,
  SyncAdapter,
  SyncPullOptions,
  SyncPush,
  SyncPushOptions,
} from './types';

type AuthModule = typeof import('firebase/auth');
type FirestoreModule = typeof import('firebase/firestore');

const APP_NAME = 'personal-os-sync';

export interface FirebaseAdapterOptions {
  /** Native credential source; null/omitted keeps the web popup flow. */
  getGoogleCredential?: () => Promise<GoogleCredential | null>;
  cancelSignIn?: () => Promise<void>;
  /** Clears the native plugin session before the SDK signs out. */
  signOutNative?: () => Promise<void>;
}

interface GoogleSignInPorts {
  credential: GoogleCredential | null;
  popup: () => Promise<void>;
  signInWithCredential: (idToken: string, accessToken: string | null) => Promise<void>;
}

/**
 * One sign-in decision shared by every platform: a native credential goes
 * straight to `signInWithCredential`, otherwise the web popup runs.
 */
export async function completeGoogleSignIn(ports: GoogleSignInPorts): Promise<void> {
  if (!ports.credential) {
    await ports.popup();
    return;
  }
  await ports.signInWithCredential(ports.credential.idToken, ports.credential.accessToken);
}

interface AuthUserLike {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toAccount(user: AuthUserLike | null): SyncAccount | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

function records(snapshot: {
  docs: Array<{ id: string; data: () => Record<string, unknown> }>;
}): Record<string, unknown>[] {
  return snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asDayStats(value: unknown): Record<string, DayStats> | null {
  return isRecord(value) ? (value as Record<string, DayStats>) : null;
}

/** Firestore rejects `undefined`; records are plain JSON, so round-trip them. */
function plainData(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

/**
 * Firebase implementation of the vendor boundary. Firebase modules are loaded
 * lazily so unconfigured builds and unit tests never pay for the SDK.
 */
export class FirebaseAdapter implements SyncAdapter {
  readonly kind = 'firebase';

  private readonly config: FirebaseConfig;
  private readonly options: FirebaseAdapterOptions;
  private authContext: Promise<{ auth: Auth; authModule: AuthModule }> | null = null;
  private dbContext: Promise<{ db: Firestore; fs: FirestoreModule }> | null = null;

  constructor(config: FirebaseConfig, options: FirebaseAdapterOptions = {}) {
    this.config = config;
    this.options = options;
  }

  subscribeAuth(
    listener: (account: SyncAccount | null) => void,
    onError?: (error: unknown) => void,
  ): () => void {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void this.getAuth()
      .then(({ auth, authModule }) => {
        if (cancelled) return;
        unsubscribe = authModule.onAuthStateChanged(auth, (user) => {
          listener(toAccount(user));
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        listener(null);
        onError?.(error);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
      unsubscribe = null;
    };
  }

  async signInWithGoogle(): Promise<void> {
    const { auth, authModule } = await this.getAuth();
    const credential = this.options.getGoogleCredential
      ? await this.options.getGoogleCredential()
      : null;

    await completeGoogleSignIn({
      credential,
      popup: async () => {
        const provider = new authModule.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await authModule.signInWithPopup(auth, provider);
      },
      signInWithCredential: async (idToken, accessToken) => {
        await authModule.signInWithCredential(
          auth,
          authModule.GoogleAuthProvider.credential(idToken, accessToken),
        );
      },
    });
  }

  async cancelSignIn(): Promise<void> {
    await this.options.cancelSignIn?.();
  }

  async signOut(): Promise<void> {
    const { auth, authModule } = await this.getAuth();
    try {
      await this.options.signOutNative?.();
    } finally {
      await authModule.signOut(auth);
    }
  }

  async pull(
    account: SyncAccount,
    options: SyncPullOptions = {},
  ): Promise<RemoteSnapshot> {
    const { db, fs } = await this.getDb();
    const user = fs.doc(db, 'users', account.uid);
    const since = options.since ?? null;

    // `updatedAt` is a string and Firestore indexes it automatically, so this
    // range query needs no composite index. Documents written without
    // `updatedAt` (never produced by the app) are skipped by the filter.
    const changed = (name: string) => {
      const collectionRef = fs.collection(user, name);
      return since ? fs.query(collectionRef, fs.where('updatedAt', '>', since)) : collectionRef;
    };

    const [blocks, tasks, notes, deadlines, appSnap, statsSnap, preferencesSnap] =
      await Promise.all([
        fs.getDocs(changed('blocks')),
        fs.getDocs(changed('tasks')),
        fs.getDocs(changed('notes')),
        fs.getDocs(changed('deadlines')),
        fs.getDoc(fs.doc(user, 'state', 'app')),
        fs.getDoc(fs.doc(user, 'state', 'stats')),
        fs.getDoc(fs.doc(user, 'state', 'preferences')),
      ]);

    const app = appSnap.exists() ? appSnap.data() : null;
    const stats = statsSnap.exists() ? asDayStats(statsSnap.data()) : null;

    return {
      blocks: records(blocks),
      tasks: records(tasks),
      notes: records(notes),
      deadlines: records(deadlines),
      profile: asRecord(app?.['profile']),
      layout: asRecord(app?.['layout']),
      appSettings: asRecord(app?.['settings']),
      // Earlier builds kept day stats inside `state/app`; read that copy once
      // as a fallback so an existing account migrates on its next push.
      dayStats: stats ?? asDayStats(app?.['dayStats']),
      preferences: preferencesSnap.exists() ? preferencesSnap.data() : null,
    };
  }

  async push(
    account: SyncAccount,
    changes: SyncPush,
    options: SyncPushOptions = {},
  ): Promise<void> {
    const { db, fs } = await this.getDb();
    const user = fs.doc(db, 'users', account.uid);

    // One batch is capped at 500 writes and fails as a whole, so a restored
    // backup or a long offline stretch is split into ordered chunks instead
    // of failing every retry with the same oversized payload.
    for (const chunk of planPushBatches(changes)) {
      const batch = fs.writeBatch(db);
      const collections: Array<[string, Array<{ id: string }>]> = [
        ['blocks', chunk.blocks],
        ['tasks', chunk.tasks],
        ['notes', chunk.notes],
        ['deadlines', chunk.deadlines],
      ];

      for (const [name, list] of collections) {
        const collectionRef = fs.collection(user, name);
        for (const record of list) {
          // The TTL timestamp rides along with the tombstone so the remote
          // stops carrying it after the retention window.
          const data = withTombstoneExpiry(plainData(record), fs.Timestamp);
          batch.set(fs.doc(collectionRef, record.id), data);
        }
      }

      const appUpdate = buildStateAppPayload({
        profile: chunk.profile ?? undefined,
        layout: chunk.layout ?? undefined,
        settings: chunk.appSettings ?? undefined,
      });

      if (writesStateApp(chunk)) {
        batch.set(fs.doc(user, 'state', 'app'), plainData(appUpdate), { merge: true });
      }
      // Replaced, not merged: the document holds the complete day map, so a
      // pruned day disappears remotely instead of lingering forever.
      if (writesDayStats(chunk)) {
        batch.set(fs.doc(user, 'state', 'stats'), plainData(chunk.dayStats));
      }
      if (chunk.preferences) {
        batch.set(fs.doc(user, 'state', 'preferences'), plainData(chunk.preferences));
      }

      await batch.commit();
      options.onChunkCommitted?.(chunk);
    }
  }

  private getAuth(): Promise<{ auth: Auth; authModule: AuthModule }> {
    if (!this.authContext) {
      this.authContext = (async () => {
        const appModule = await import('firebase/app');
        const authModule = await import('firebase/auth');
        const app =
          appModule.getApps().find((entry) => entry.name === APP_NAME) ??
          appModule.initializeApp(this.config, APP_NAME);
        return { auth: authModule.getAuth(app), authModule };
      })();
    }
    return this.authContext;
  }

  private getDb(): Promise<{ db: Firestore; fs: FirestoreModule }> {
    if (!this.dbContext) {
      this.dbContext = (async () => {
        const appModule = await import('firebase/app');
        const fs = await import('firebase/firestore');
        const app =
          appModule.getApps().find((entry) => entry.name === APP_NAME) ??
          appModule.initializeApp(this.config, APP_NAME);

        let db: Firestore;
        try {
          db = fs.initializeFirestore(app, {
            ignoreUndefinedProperties: true,
            localCache: fs.persistentLocalCache({
              tabManager: fs.persistentMultipleTabManager(),
            }),
          });
        } catch {
          try {
            db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true });
          } catch {
            db = fs.getFirestore(app);
          }
        }

        return { db, fs };
      })();
    }
    return this.dbContext;
  }
}

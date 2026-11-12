import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SecureStorageAdapter } from '@/platform/types';

const firebase = vi.hoisted(() => {
  class GoogleAuthProvider {
    addScope = vi.fn();
    setCustomParameters = vi.fn();
    static credential = vi.fn((idToken: string) => ({
      providerId: 'google.com',
      idToken,
    }));
  }

  return {
    GoogleAuthProvider,
    getAuth: vi.fn(() => ({ currentUser: null })),
    signInWithPopup: vi.fn().mockResolvedValue({}),
    signInWithCredential: vi.fn().mockResolvedValue({}),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChanged: vi.fn(
      (
        _auth: unknown,
        _listener: (user: unknown) => void,
      ): (() => void) => () => undefined,
    ),
  };
});

const nativeAuth = vi.hoisted(() => ({
  FirebaseAuthentication: {
    signInWithGoogle: vi
      .fn()
      .mockResolvedValue({ credential: { idToken: 'native-id-token' } }),
    getIdToken: vi.fn().mockResolvedValue({ token: 'refreshed-id-token' }),
    signOut: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('firebase/auth', () => firebase);
vi.mock('firebase/app', () => ({
  getApps: () => [{ name: 'personal-os-sync' }],
  initializeApp: vi.fn(() => ({ name: 'personal-os-sync' })),
}));
vi.mock('@capacitor-firebase/authentication', () => nativeAuth);

class MemorySecureStorage implements SecureStorageAdapter {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function stubFirebaseEnv(): void {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
  vi.stubEnv('VITE_FIREBASE_APP_ID', '1:2:web:3');
}

describe('WebAuthBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubFirebaseEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('opens the Google popup with account selection', async () => {
    const { WebAuthBridge } = await import('@/platform/web');
    const bridge = new WebAuthBridge(new MemorySecureStorage());

    await bridge.signIn();

    expect(firebase.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(firebase.GoogleAuthProvider).toBeDefined();
  });

  it('clears the stored token on sign out', async () => {
    const storage = new MemorySecureStorage();
    storage.values.set('auth_token', 'stale-token');
    const { WebAuthBridge } = await import('@/platform/web');
    const bridge = new WebAuthBridge(storage);

    await bridge.signOut();

    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(storage.values.has('auth_token')).toBe(false);
  });

  it('forwards auth state changes and unsubscribes on cleanup', async () => {
    const listeners: Array<(user: unknown) => void> = [];
    const unsubscribe = vi.fn();
    firebase.onAuthStateChanged.mockImplementationOnce((_auth, listener) => {
      listeners.push(listener);
      return unsubscribe;
    });
    const { WebAuthBridge } = await import('@/platform/web');
    const bridge = new WebAuthBridge(new MemorySecureStorage());
    const seen: Array<{ uid: string } | null> = [];

    const cleanup = bridge.onAuthChange((user) => seen.push(user));

    await vi.waitFor(() => expect(listeners.length).toBe(1));
    listeners[0]?.({ uid: 'abc', email: null, displayName: null, photoURL: null });
    cleanup();

    expect(seen).toEqual([{ uid: 'abc', email: null, displayName: null, photoURL: null }]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('CapacitorAuthBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubFirebaseEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exchanges the native Google ID token for a Firebase session', async () => {
    const { CapacitorAuthBridge } = await import('@/platform/capacitorAuthBridge');
    const bridge = new CapacitorAuthBridge();

    await bridge.signIn();

    expect(nativeAuth.FirebaseAuthentication.signInWithGoogle).toHaveBeenCalledWith({
      skipNativeAuth: true,
    });
    expect(firebase.GoogleAuthProvider.credential).toHaveBeenCalledWith(
      'native-id-token',
      null,
    );
    expect(firebase.signInWithCredential).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idToken: 'native-id-token' }),
    );
  });

  it('falls back to the native ID token endpoint when no credential is returned', async () => {
    nativeAuth.FirebaseAuthentication.signInWithGoogle.mockResolvedValueOnce({
      credential: null,
    });
    const { CapacitorAuthBridge } = await import('@/platform/capacitorAuthBridge');
    const bridge = new CapacitorAuthBridge();

    await bridge.signIn();

    expect(nativeAuth.FirebaseAuthentication.getIdToken).toHaveBeenCalled();
    expect(firebase.GoogleAuthProvider.credential).toHaveBeenCalledWith(
      'refreshed-id-token',
      null,
    );
  });

  it('never persists the ID token itself', async () => {
    localStorage.clear();
    const { CapacitorAuthBridge } = await import('@/platform/capacitorAuthBridge');
    const bridge = new CapacitorAuthBridge();

    await bridge.signIn();

    expect(localStorage.length).toBe(0);
    expect(JSON.stringify(localStorage)).not.toContain('native-id-token');
  });

  it('signs out of both the native plugin and the Firebase SDK', async () => {
    const { CapacitorAuthBridge } = await import('@/platform/capacitorAuthBridge');
    const bridge = new CapacitorAuthBridge();

    await bridge.signOut();

    expect(nativeAuth.FirebaseAuthentication.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
  });
});

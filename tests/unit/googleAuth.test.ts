import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthFlowError,
  createGoogleAuth,
  friendlyAuthError,
  isAuthCancellation,
} from '@/platform/googleAuth';

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const nativeAuth = vi.hoisted(() => ({
  FirebaseAuthentication: {
    signInWithGoogle: vi.fn(),
    getIdToken: vi.fn(),
    signOut: vi.fn(),
  },
}));

vi.mock('@tauri-apps/api/core', () => tauri);
vi.mock('@capacitor-firebase/authentication', () => nativeAuth);

const macOS = createGoogleAuth({ native: true, platform: 'macos' });
const android = createGoogleAuth({ native: true, platform: 'android' });

describe('friendlyAuthError', () => {
  it('treats a dismissed picker as a cancellation with no message', () => {
    expect(friendlyAuthError({ code: 'auth/popup-closed-by-user' })).toBe('');
    expect(friendlyAuthError({ code: 'auth/user-cancelled' })).toBe('');
    expect(friendlyAuthError('Sign-in cancelled.')).toBe('');
    expect(isAuthCancellation({ code: '12501' })).toBe(true);
  });

  it('maps known codes to short copy without leaking the raw error', () => {
    expect(friendlyAuthError({ code: 'auth/unauthorized-domain' })).toBe(
      'This domain is not allowed in Firebase Auth settings.',
    );
    expect(friendlyAuthError({ code: 'auth/invalid-credential' })).toBe(
      'Google rejected this build. Check the OAuth client ID in Firebase.',
    );
    const raw = new Error('FirebaseError: internal token abc.def.ghi expired');
    expect(friendlyAuthError(raw)).toBe('Could not sign in. Try again.');
    expect(friendlyAuthError(raw)).not.toContain('abc.def.ghi');
  });

  it('passes through the short messages the Rust command returns', () => {
    expect(friendlyAuthError('Sign-in timed out. Try again.')).toBe(
      'Sign-in timed out. Try again.',
    );
    expect(friendlyAuthError(new AuthFlowError('Could not open the browser.'))).toBe(
      'Could not open the browser.',
    );
  });
});

describe('desktop credential', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the tokens from the loopback command', async () => {
    tauri.invoke.mockResolvedValueOnce({
      idToken: 'desktop-id-token',
      accessToken: 'desktop-access-token',
    });

    await expect(macOS.getCredential()).resolves.toEqual({
      idToken: 'desktop-id-token',
      accessToken: 'desktop-access-token',
    });
    expect(tauri.invoke).toHaveBeenCalledWith('google_sign_in');
  });

  it('rejects an empty ID token', async () => {
    tauri.invoke.mockResolvedValueOnce({ idToken: '' });

    await expect(macOS.getCredential()).rejects.toThrow('Google did not return an ID token.');
  });

  it('wraps a command failure in user-facing copy', async () => {
    tauri.invoke.mockRejectedValueOnce('Sign-in timed out. Try again.');

    await expect(macOS.getCredential()).rejects.toThrow('Sign-in timed out. Try again.');
  });

  it('cancels through the loopback command', async () => {
    tauri.invoke.mockResolvedValueOnce(undefined);

    await macOS.cancel();

    expect(tauri.invoke).toHaveBeenCalledWith('google_sign_in_cancel');
  });

  it('does not call the native plugin on desktop sign-out', async () => {
    await macOS.signOutNative();

    expect(nativeAuth.FirebaseAuthentication.signOut).not.toHaveBeenCalled();
  });
});

describe('android credential', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the native Google ID token and access token', async () => {
    nativeAuth.FirebaseAuthentication.signInWithGoogle.mockResolvedValueOnce({
      credential: { idToken: 'android-id-token', accessToken: 'android-access-token' },
    });

    await expect(android.getCredential()).resolves.toEqual({
      idToken: 'android-id-token',
      accessToken: 'android-access-token',
    });
    expect(nativeAuth.FirebaseAuthentication.signInWithGoogle).toHaveBeenCalledWith({
      skipNativeAuth: true,
    });
  });

  it('falls back to the ID token endpoint', async () => {
    nativeAuth.FirebaseAuthentication.signInWithGoogle.mockResolvedValueOnce({
      credential: null,
    });
    nativeAuth.FirebaseAuthentication.getIdToken.mockResolvedValueOnce({
      token: 'refreshed-token',
    });

    await expect(android.getCredential()).resolves.toEqual({
      idToken: 'refreshed-token',
      accessToken: null,
    });
  });

  it('clears the native plugin session on sign-out', async () => {
    nativeAuth.FirebaseAuthentication.signOut.mockResolvedValueOnce(undefined);

    await android.signOutNative();

    expect(nativeAuth.FirebaseAuthentication.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('web credential', () => {
  it('returns null so the popup flow is used', async () => {
    const web = createGoogleAuth({ native: false, platform: 'web' });

    await expect(web.getCredential()).resolves.toBeNull();
    expect(tauri.invoke).not.toHaveBeenCalled();
    expect(nativeAuth.FirebaseAuthentication.signInWithGoogle).not.toHaveBeenCalled();
  });
});

describe('completeGoogleSignIn', () => {
  it('exchanges a native credential instead of opening the popup', async () => {
    const { completeGoogleSignIn } = await import('@/sync/firebaseAdapter');
    const popup = vi.fn();
    const signInWithCredential = vi.fn();

    await completeGoogleSignIn({
      credential: { idToken: 'id', accessToken: 'access' },
      popup,
      signInWithCredential,
    });

    expect(popup).not.toHaveBeenCalled();
    expect(signInWithCredential).toHaveBeenCalledWith('id', 'access');
  });

  it('falls back to the popup when no native credential exists', async () => {
    const { completeGoogleSignIn } = await import('@/sync/firebaseAdapter');
    const popup = vi.fn().mockResolvedValue(undefined);
    const signInWithCredential = vi.fn();

    await completeGoogleSignIn({ credential: null, popup, signInWithCredential });

    expect(popup).toHaveBeenCalledTimes(1);
    expect(signInWithCredential).not.toHaveBeenCalled();
  });
});

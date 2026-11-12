import { isNative, platformName, type PlatformName } from './index';

/** A Google credential that the Firebase JS SDK can exchange for a session. */
export interface GoogleCredential {
  idToken: string;
  accessToken: string | null;
}

export interface GoogleAuthContext {
  native: boolean;
  platform: PlatformName;
}

export interface GoogleAuthRuntime {
  /** Returns null on the web, where the Firebase popup flow is used instead. */
  getCredential: () => Promise<GoogleCredential | null>;
  cancel: () => Promise<void>;
  /** Clears the native plugin session; the Firebase SDK sign-out is separate. */
  signOutNative: () => Promise<void>;
}

/**
 * A failure whose message is already short, human-friendly copy. Raw SDK
 * errors and tokens must never reach the UI.
 */
export class AuthFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthFlowError';
  }
}

const FALLBACK = 'Could not sign in. Try again.';
const DESKTOP_PLATFORMS: readonly PlatformName[] = ['macos', 'windows', 'linux'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function errorCode(error: unknown): string {
  if (!isRecord(error)) return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (isRecord(error) && typeof (error as { message?: unknown }).message === 'string') {
    return String((error as { message: string }).message);
  }
  return '';
}

/** True when the user dismissed the picker or popup; no error should be shown. */
export function isAuthCancellation(error: unknown): boolean {
  const code = errorCode(error).toLowerCase();
  const message = errorMessage(error).toLowerCase();
  return (
    code.includes('cancel') ||
    code.includes('popup-closed') ||
    code === '12501' ||
    message.includes('cancel') ||
    message.includes('12501')
  );
}

/** Short, human copy for any auth failure; never a raw token or stack trace. */
export function friendlyAuthError(error: unknown): string {
  if (isAuthCancellation(error)) return '';
  if (error instanceof AuthFlowError) return error.message;

  // The Rust command rejects with copy we wrote ourselves.
  if (typeof error === 'string' && error.length <= 160 && !error.includes('\n')) {
    return error;
  }

  switch (errorCode(error)) {
    case 'auth/unauthorized-domain':
      return 'This domain is not allowed in Firebase Auth settings.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this Firebase project.';
    case 'auth/network-request-failed':
      return 'No connection. Try again when you are online.';
    case 'auth/invalid-credential':
    case 'auth/invalid-id-token':
    case 'auth/audience-mismatch':
      return 'Google rejected this build. Check the OAuth client ID in Firebase.';
    case 'auth/account-exists-with-different-credential':
      return 'That email already uses a different sign-in method.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    default:
      return FALLBACK;
  }
}

function credentialFrom(value: unknown): GoogleCredential {
  const record = isRecord(value) ? value : {};
  const idToken = record['idToken'];
  const accessToken = record['accessToken'];
  if (typeof idToken !== 'string' || !idToken.trim()) {
    throw new AuthFlowError('Google did not return an ID token.');
  }
  return {
    idToken,
    accessToken: typeof accessToken === 'string' && accessToken ? accessToken : null,
  };
}

async function desktopCredential(): Promise<GoogleCredential> {
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return credentialFrom(await invoke('google_sign_in'));
  } catch (error) {
    if (error instanceof AuthFlowError) throw error;
    // Tauri rejects with our Rust message (plain string).
    throw new AuthFlowError(friendlyAuthError(error));
  }
}

async function androidCredential(): Promise<GoogleCredential> {
  const native = await import('@capacitor-firebase/authentication');
  const result = await native.FirebaseAuthentication.signInWithGoogle({
    skipNativeAuth: true,
  });
  const idToken = result.credential?.idToken;
  if (idToken) {
    return {
      idToken,
      accessToken: result.credential?.accessToken ?? null,
    };
  }
  const refreshed = await native.FirebaseAuthentication.getIdToken();
  return credentialFrom({ idToken: refreshed.token });
}

export function createGoogleAuth(context: GoogleAuthContext): GoogleAuthRuntime {
  return {
    async getCredential(): Promise<GoogleCredential | null> {
      if (!context.native) return null;
      if (context.platform === 'android') return androidCredential();
      if (DESKTOP_PLATFORMS.includes(context.platform)) return desktopCredential();
      return null;
    },

    async cancel(): Promise<void> {
      if (!context.native || !DESKTOP_PLATFORMS.includes(context.platform)) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('google_sign_in_cancel');
      } catch {
        // Cancel is best effort; the loopback wait also times out.
      }
    },

    async signOutNative(): Promise<void> {
      if (!context.native || context.platform !== 'android') return;
      try {
        const native = await import('@capacitor-firebase/authentication');
        await native.FirebaseAuthentication.signOut();
      } catch {
        // The JS SDK sign-out still runs; the native session is best effort.
      }
    },
  };
}

/**
 * Reads the current platform on every call: `initializePlatform()` swaps the
 * adapters after startup, so the context cannot be captured at import time.
 */
export const googleAuth: GoogleAuthRuntime = {
  getCredential: () => createGoogleAuth({ native: isNative(), platform: platformName }).getCredential(),
  cancel: () => createGoogleAuth({ native: isNative(), platform: platformName }).cancel(),
  signOutNative: () =>
    createGoogleAuth({ native: isNative(), platform: platformName }).signOutNative(),
};

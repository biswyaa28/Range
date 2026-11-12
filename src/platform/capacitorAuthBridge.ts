import type { Auth } from 'firebase/auth';
import type { AuthBridge, AuthUser } from './types';
import { AuthFlowError, createGoogleAuth } from './googleAuth';
import { readWebFirebaseConfig } from './web';

type AuthModule = typeof import('firebase/auth');

const APP_NAME = 'personal-os-sync';

function toAuthUser(
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  } | null,
): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

/**
 * Android bridge: the native plugin runs the system Google account picker and
 * returns a Google ID token, which is exchanged for a Firebase JS SDK session.
 * Tokens are never persisted; the JS SDK owns the refresh token.
 */
export class CapacitorAuthBridge implements AuthBridge {
  private readonly credentials = createGoogleAuth({ native: true, platform: 'android' });
  private authContext: Promise<{ auth: Auth; authModule: AuthModule }> | null = null;

  async signIn(): Promise<void> {
    const credential = await this.credentials.getCredential();
    if (!credential) {
      throw new AuthFlowError('Google sign-in is unavailable on this device.');
    }
    const { auth, authModule } = await this.getAuthContext();
    await authModule.signInWithCredential(
      auth,
      authModule.GoogleAuthProvider.credential(credential.idToken, credential.accessToken),
    );
  }

  async signOut(): Promise<void> {
    await this.credentials.signOutNative();
    const { auth, authModule } = await this.getAuthContext();
    await authModule.signOut(auth);
  }

  onAuthChange(listener: (user: AuthUser | null) => void): () => void {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void this.getAuthContext()
      .then(({ auth, authModule }) => {
        if (cancelled) return;
        unsubscribe = authModule.onAuthStateChanged(auth, (user) =>
          listener(toAuthUser(user)),
        );
      })
      .catch(() => {
        if (!cancelled) listener(null);
      });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
    };
  }

  private async getAuthContext(): Promise<{ auth: Auth; authModule: AuthModule }> {
    if (!this.authContext) {
      this.authContext = (async () => {
        const config = readWebFirebaseConfig();
        if (!config) {
          throw new AuthFlowError(
            'Firebase is not configured. Set the VITE_FIREBASE_* environment variables.',
          );
        }
        const appModule = await import('firebase/app');
        const authModule = await import('firebase/auth');
        const app =
          appModule.getApps().find((entry) => entry.name === APP_NAME) ??
          appModule.initializeApp(config, APP_NAME);
        return { auth: authModule.getAuth(app), authModule };
      })();
    }
    return this.authContext;
  }
}

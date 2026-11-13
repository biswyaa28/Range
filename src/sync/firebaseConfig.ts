export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

function readValue(env: Record<string, unknown>, key: string): string {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Reads the Firebase web config from Vite env vars. Sync stays disabled unless
 * the required values are present, so unconfigured builds never load Firebase.
 */
export function readFirebaseConfig(
  env: Record<string, unknown>,
): FirebaseConfig | null {
  const apiKey = readValue(env, 'VITE_FIREBASE_API_KEY');
  const authDomain = readValue(env, 'VITE_FIREBASE_AUTH_DOMAIN');
  const projectId = readValue(env, 'VITE_FIREBASE_PROJECT_ID');
  const appId = readValue(env, 'VITE_FIREBASE_APP_ID');

  if (!apiKey || !authDomain || !projectId || !appId) return null;

  const storageBucket = readValue(env, 'VITE_FIREBASE_STORAGE_BUCKET');
  const messagingSenderId = readValue(env, 'VITE_FIREBASE_MESSAGING_SENDER_ID');

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    ...(storageBucket ? { storageBucket } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
  };
}

export const firebaseConfig = readFirebaseConfig(
  import.meta.env as unknown as Record<string, unknown>,
);

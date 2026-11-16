import { secureStorage, isNative, platformName } from '@/platform';
import {
  INTEGRATION_SCOPES,
  INTEGRATION_TOKEN_KEY,
  type IntegrationId,
} from '@/domain/integrations';

export class IntegrationUnavailableError extends Error {
  constructor() {
    super('Google integrations are not available in the browser build.');
    this.name = 'IntegrationUnavailableError';
  }
}

export class ReconnectRequiredError extends Error {
  constructor(message = 'Google access expired. Reconnect Google to continue.') {
    super(message);
    this.name = 'ReconnectRequiredError';
  }
}

export class IntegrationCancelledError extends Error {
  constructor() {
    super('Google connection cancelled.');
    this.name = 'IntegrationCancelledError';
  }
}

export interface IntegrationToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scopes: string[];
}

export interface IntegrationAuthDeps {
  native: boolean;
  platform: string;
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };
  now: () => number;
  signIn: (scopes: string[]) => Promise<IntegrationToken>;
  refresh: (refreshToken: string) => Promise<IntegrationToken>;
  fetch: typeof fetch;
}

function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/cancel|12501|popup|dismiss/i.test(message)) return 'Google connection cancelled.';
  if (/invalid_grant|expired|revoked|reauth/i.test(message)) {
    return 'Google access expired. Reconnect Google.';
  }
  if (/network|offline|failed to fetch/i.test(message)) {
    return 'No connection. Cached data is still available.';
  }
  if (message.length > 0 && message.length <= 160 && !/token|secret|client_id/i.test(message)) {
    return message;
  }
  return 'Could not connect Google. Try again.';
}

export function tokenNeedsRefresh(token: IntegrationToken, nowMs: number): boolean {
  const expires = Date.parse(token.expiresAt);
  if (!Number.isFinite(expires)) return true;
  return expires - nowMs < 60_000;
}

async function desktopSignIn(scopes: string[]): Promise<IntegrationToken> {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<{
    accessToken?: string;
    refreshToken?: string | null;
    expiresAt?: string;
    scopes?: string[];
  }>('google_integrations_sign_in', { scopes });
  if (!result?.accessToken) throw new Error('Google did not return an access token.');
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? null,
    expiresAt: result.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
    scopes: result.scopes ?? scopes,
  };
}

async function androidSignIn(scopes: string[]): Promise<IntegrationToken> {
  const native = await import('@capacitor-firebase/authentication');
  const result = await native.FirebaseAuthentication.signInWithGoogle({
    skipNativeAuth: true,
    scopes,
  });
  const accessToken = result.credential?.accessToken;
  if (!accessToken) throw new ReconnectRequiredError('Google did not return an access token.');
  return {
    accessToken,
    // Android's Google sign-in does not expose a refresh token. Reconnecting is
    // the recovery path when the short-lived access token expires.
    refreshToken: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    scopes,
  };
}

export function createIntegrationAuth(overrides: Partial<IntegrationAuthDeps> = {}) {
  const deps: IntegrationAuthDeps = {
    native: isNative(),
    platform: platformName,
    storage: secureStorage,
    now: Date.now,
    signIn: async (scopes) => {
      if (platformName === 'android') return androidSignIn(scopes);
      return desktopSignIn(scopes);
    },
    refresh: async (refreshToken) => {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{
        accessToken?: string;
        expiresAt?: string;
      }>('google_integrations_refresh', { refreshToken });
      if (!result?.accessToken) throw new ReconnectRequiredError();
      return {
        accessToken: result.accessToken,
        refreshToken,
        expiresAt: result.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
        scopes: [],
      };
    },
    fetch: (...args) => fetch(...args),
    ...overrides,
  };

  const available = deps.native && deps.platform !== 'web';

  async function readToken(): Promise<IntegrationToken | null> {
    try {
      const raw = await deps.storage.getItem(INTEGRATION_TOKEN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<IntegrationToken>;
      if (typeof parsed.accessToken !== 'string' || !parsed.accessToken) return null;
      return {
        accessToken: parsed.accessToken,
        refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
        expiresAt:
          typeof parsed.expiresAt === 'string'
            ? parsed.expiresAt
            : new Date(0).toISOString(),
        scopes: Array.isArray(parsed.scopes)
          ? parsed.scopes.filter((scope): scope is string => typeof scope === 'string')
          : [],
      };
    } catch {
      return null;
    }
  }

  async function writeToken(token: IntegrationToken): Promise<void> {
    await deps.storage.setItem(INTEGRATION_TOKEN_KEY, JSON.stringify(token));
  }

  async function clearToken(): Promise<void> {
    try {
      await deps.storage.removeItem(INTEGRATION_TOKEN_KEY);
    } catch {
      // A protected store can be unavailable after a restore; local cache is
      // cleared first so no usable credential remains in app state.
    }
  }

  async function connect(scopes: string[]): Promise<IntegrationToken> {
    if (!available) throw new IntegrationUnavailableError();
    try {
      const token = await deps.signIn(scopes);
      await writeToken(token);
      return token;
    } catch (error) {
      if (error instanceof IntegrationUnavailableError) throw error;
      throw new Error(friendly(error));
    }
  }

  async function getAccessToken(): Promise<IntegrationToken> {
    if (!available) throw new IntegrationUnavailableError();
    const token = await readToken();
    if (!token) throw new ReconnectRequiredError();
    if (!tokenNeedsRefresh(token, deps.now())) return token;

    if (!token.refreshToken) {
      await clearToken();
      throw new ReconnectRequiredError();
    }

    try {
      const refreshed = await deps.refresh(token.refreshToken);
      const next: IntegrationToken = {
        ...refreshed,
        refreshToken: refreshed.refreshToken ?? token.refreshToken,
        scopes: refreshed.scopes.length > 0 ? refreshed.scopes : token.scopes,
      };
      await writeToken(next);
      return next;
    } catch (error) {
      await clearToken();
      throw new ReconnectRequiredError(friendly(error));
    }
  }

  /**
   * Revoking a Google token ends every scope on it. Callers must mark any other
   * enabled integration as reconnect-required after this succeeds.
   */
  async function revoke(): Promise<void> {
    const token = await readToken();
    await clearToken();
    if (!token) return;
    const credential = token.refreshToken || token.accessToken;
    try {
      await deps.fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(credential)}`,
      });
    } catch {
      // Local deletion is the guarantee; a network failure must not keep the
      // token in secure storage.
    }
  }

  return {
    available,
    connect,
    readToken,
    getAccessToken,
    revoke,
    clearToken,
    scopesFor: (enabled: IntegrationId[]): string[] =>
      enabled.flatMap((id) => INTEGRATION_SCOPES[id]),
    friendly,
  };
}

export const integrationAuth = createIntegrationAuth();

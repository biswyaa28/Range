import { describe, expect, it, vi } from 'vitest';
import {
  ReconnectRequiredError,
  createIntegrationAuth,
  type IntegrationToken,
} from '@/integrations/auth';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: async (key: string) => {
      map.delete(key);
    },
    dump: () => map,
  };
}

const now = Date.parse('2026-11-16T10:00:00Z');
const valid: IntegrationToken = {
  accessToken: 'access-old',
  refreshToken: 'refresh-old',
  expiresAt: new Date(now + 3_600_000).toISOString(),
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
};

function auth(overrides: Partial<Parameters<typeof createIntegrationAuth>[0]> = {}) {
  return createIntegrationAuth({
    native: true,
    platform: 'macos',
    storage: memoryStorage(),
    now: () => now,
    signIn: vi.fn(async (scopes: string[]) => ({ ...valid, scopes })),
    refresh: vi.fn(async () => ({ ...valid, accessToken: 'access-new' })),
    fetch: vi.fn(async () => new Response(null, { status: 200 })),
    ...overrides,
  });
}

describe('integration auth', () => {
  it('stores incremental scopes and upgrades without dropping Gmail', async () => {
    const runtime = auth();
    const gmail = await runtime.connect(['gmail-scope']);
    expect(gmail.scopes).toEqual(['gmail-scope']);
    const upgraded = await runtime.connect(['gmail-scope', 'classroom-scope']);
    expect(upgraded.scopes).toEqual(['gmail-scope', 'classroom-scope']);
    expect((await runtime.readToken())?.scopes).toHaveLength(2);
  });

  it('refreshes an expired token and persists the new access token', async () => {
    const storage = memoryStorage();
    const refresh = vi.fn(async () => ({
      ...valid,
      accessToken: 'access-new',
      expiresAt: new Date(now + 3_600_000).toISOString(),
    }));
    const runtime = auth({ storage, refresh });
    await storage.setItem(
      'integration_google_tokens',
      JSON.stringify({ ...valid, expiresAt: new Date(now - 1000).toISOString() }),
    );
    const token = await runtime.getAccessToken();
    expect(token.accessToken).toBe('access-new');
    expect(refresh).toHaveBeenCalledWith('refresh-old');
  });

  it('turns invalid_grant into a reconnect state and deletes the token', async () => {
    const storage = memoryStorage();
    const runtime = auth({
      storage,
      refresh: vi.fn(async () => {
        throw new Error('invalid_grant');
      }),
    });
    await storage.setItem(
      'integration_google_tokens',
      JSON.stringify({ ...valid, expiresAt: new Date(now - 1000).toISOString() }),
    );
    await expect(runtime.getAccessToken()).rejects.toBeInstanceOf(ReconnectRequiredError);
    expect(await runtime.readToken()).toBeNull();
  });

  it('revokes through the Google endpoint and clears local credentials', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const storage = memoryStorage();
    const runtime = auth({ storage, fetch: fetchMock });
    await runtime.connect(['scope']);
    await runtime.revoke();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await storage.getItem('integration_google_tokens')).toBeNull();
  });

  it('rejects integrations in the browser build', async () => {
    const runtime = auth({ native: false, platform: 'web' });
    await expect(runtime.connect(['scope'])).rejects.toThrow(
      'not available in the browser build',
    );
  });
});

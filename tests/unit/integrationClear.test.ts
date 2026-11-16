import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { integrationAuth } from '@/integrations/auth';
import { disconnectAllIntegrations } from '@/integrations/controller';
import { integrationStore } from '@/store/integrationStore';

const fetchMock = vi.fn<typeof fetch>();

function seedConnectedIntegrations(): void {
  integrationStore.patchSettings({
    gmail: true,
    classroom: true,
    aiRead: true,
    senderFilters: ['@university.edu'],
  });
  integrationStore.setGmail({ messages: [], digest: [], fetchedAt: '2026-11-16T00:00:00Z' });
  integrationStore.setClassroom({
    courses: [],
    work: [],
    announcements: [],
    fetchedAt: '2026-11-16T00:00:00Z',
  });
}

describe('clear integration data', () => {
  beforeEach(() => {
    integrationStore.reset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    integrationStore.reset();
  });

  it('revokes each connected integration and wipes its cache and settings', async () => {
    seedConnectedIntegrations();
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    const revoke = vi.spyOn(integrationAuth, 'revoke').mockImplementation(async () => {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST' });
        return true;
      } catch {
        return false;
      }
    });

    const result = await disconnectAllIntegrations();

    expect(result.revoked).toBe(true);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const state = integrationStore.get();
    expect(state.settings).toMatchObject({
      gmail: false,
      classroom: false,
      aiRead: false,
      senderFilters: [],
    });
    expect(state.gmail).toBeNull();
    expect(state.classroom).toBeNull();
  });

  it('still wipes locally when revoke cannot reach Google', async () => {
    seedConnectedIntegrations();
    fetchMock.mockRejectedValue(new Error('offline'));
    vi.spyOn(integrationAuth, 'revoke').mockImplementation(async () => {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST' });
        return true;
      } catch {
        return false;
      }
    });

    const result = await disconnectAllIntegrations();

    expect(result.revoked).toBe(false);
    expect(integrationStore.get().settings.gmail).toBe(false);
    expect(integrationStore.get().settings.classroom).toBe(false);
    expect(integrationStore.get().gmail).toBeNull();
    expect(integrationStore.get().classroom).toBeNull();
  });
});

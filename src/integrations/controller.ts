import {
  extractGmailDigest,
  integrationScopeUnion,
  type ClassroomSnapshot,
  type GmailSnapshot,
  type IntegrationId,
  type IntegrationSettings,
} from '@/domain/integrations';
import { isNative, platformName, storage } from '@/platform';
import { integrationStore } from '@/store/integrationStore';
import {
  IntegrationCancelledError,
  IntegrationUnavailableError,
  ReconnectRequiredError,
  integrationAuth,
} from './auth';
import { GoogleApiError, fetchClassroomSnapshot, fetchGmailSnapshot } from './googleApi';

const SIX_HOURS = 6 * 60 * 60 * 1000;

export class IntegrationOfflineError extends Error {
  constructor(message = 'No connection. Showing cached data.') {
    super(message);
    this.name = 'IntegrationOfflineError';
  }
}

export function integrationsMocked(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return storage.getItem('personalOS_integrations_mock') === '1';
  } catch {
    return false;
  }
}

function isAvailable(): boolean {
  return integrationsMocked() || (isNative() && platformName !== 'web');
}

function errorCopy(error: unknown): string {
  if (error instanceof IntegrationUnavailableError) return error.message;
  if (error instanceof ReconnectRequiredError) return error.message;
  if (error instanceof IntegrationCancelledError) return 'Google connection cancelled.';
  if (error instanceof GoogleApiError) return error.message;
  if (error instanceof Error && error.message.length <= 180) return error.message;
  return 'Could not refresh Google data. Try again.';
}

export function integrationsAvailable(): boolean {
  return isAvailable();
}

export async function connectIntegration(id: IntegrationId): Promise<void> {
  if (!isAvailable()) {
    integrationStore.setAuth({
      state: 'unavailable',
      lastError: 'Google integrations are not available in the browser build.',
    });
    throw new IntegrationUnavailableError();
  }

  const current = integrationStore.get();
  const nextSettings: IntegrationSettings = { ...current.settings, [id]: true };
  const scopes = integrationScopeUnion(nextSettings);

  let token: Awaited<ReturnType<typeof integrationAuth.connect>>;
  try {
    token = await integrationAuth.connect(scopes);
  } catch (error) {
    integrationStore.patchSettings({ [id]: false });
    if (error instanceof IntegrationCancelledError) throw error;
    integrationStore.setAuth({ state: 'reconnect', lastError: errorCopy(error) });
    throw error;
  }

  integrationStore.patchSettings({ [id]: true });
  integrationStore.setAuth({
    state: 'connected',
    scopes: token.scopes.length > 0 ? token.scopes : scopes,
    expiresAt: token.expiresAt,
    lastError: null,
  });
  try {
    await refreshIntegration(id);
  } catch (error) {
    // The Google account is connected; a first fetch can still fail offline.
    if (error instanceof ReconnectRequiredError) throw error;
    integrationStore.setAuth({ lastError: errorCopy(error) });
  }
}

export async function disconnectIntegration(id: IntegrationId): Promise<boolean> {
  const current = integrationStore.get();
  const revoked = await integrationAuth.revoke();
  integrationStore.clearIntegration(id);
  const remaining =
    id === 'gmail' ? current.settings.classroom : current.settings.gmail;
  integrationStore.patchSettings({ [id]: false, aiRead: false });
  integrationStore.setAuth({
    state: remaining ? 'reconnect' : 'disconnected',
    scopes: [],
    expiresAt: null,
    lastError: remaining ? 'Reconnect Google for the other integration.' : null,
  });
  return revoked;
}

/**
 * Wipes every local Google integration setting, cached item and token as part
 * of “Clear data on this device”. Each enabled integration goes through the
 * normal disconnect path, including the revoke request. The local wipe is
 * unconditional; `revoked` is false when Google could not be reached.
 */
export async function disconnectAllIntegrations(): Promise<{ revoked: boolean }> {
  const current = integrationStore.get();
  const enabled = (['gmail', 'classroom'] as const).filter(
    (id) => current.settings[id],
  );
  let revoked = true;
  try {
    for (const id of enabled) {
      revoked = (await disconnectIntegration(id)) && revoked;
    }
    if (enabled.length === 0) revoked = await integrationAuth.revoke();
  } finally {
    integrationStore.reset();
  }
  return { revoked };
}

async function accessToken(): Promise<string> {
  const token = await integrationAuth.getAccessToken();
  integrationStore.setAuth({ expiresAt: token.expiresAt, lastError: null });
  return token.accessToken;
}

export async function refreshClassroom(): Promise<ClassroomSnapshot> {
  if (!isAvailable()) throw new IntegrationUnavailableError();
  try {
    const token = await accessToken();
    const snapshot = await fetchClassroomSnapshot({ accessToken: token });
    integrationStore.setClassroom(snapshot);
    integrationStore.setAuth({ state: 'connected', lastError: null });
    return snapshot;
  } catch (error) {
    if (error instanceof ReconnectRequiredError) {
      integrationStore.setAuth({
        state: 'reconnect',
        scopes: [],
        expiresAt: null,
        lastError: error.message,
      });
    }
    throw error;
  }
}

export async function refreshGmail(): Promise<GmailSnapshot> {
  if (!isAvailable()) throw new IntegrationUnavailableError();
  try {
    const token = await accessToken();
    const settings = integrationStore.get().settings;
    const snapshot = await fetchGmailSnapshot({ accessToken: token, settings });
    const digest = extractGmailDigest(snapshot.messages, {
      now: new Date(),
      senderFilters: settings.senderFilters,
    });
    const next = { ...snapshot, digest };
    integrationStore.setGmail(next);
    integrationStore.setAuth({ state: 'connected', lastError: null });
    return next;
  } catch (error) {
    if (error instanceof ReconnectRequiredError) {
      integrationStore.setAuth({
        state: 'reconnect',
        scopes: [],
        expiresAt: null,
        lastError: error.message,
      });
    }
    throw error;
  }
}

export async function refreshIntegration(id: IntegrationId): Promise<void> {
  if (id === 'classroom') await refreshClassroom();
  else await refreshGmail();
}

export async function refreshStaleIntegrations(nowMs = Date.now()): Promise<void> {
  if (integrationsMocked()) return;
  const state = integrationStore.get();
  if (state.auth.state !== 'connected') return;

  if (state.settings.classroom) {
    const at = Date.parse(state.classroom?.fetchedAt ?? '');
    if (!Number.isFinite(at) || nowMs - at > SIX_HOURS) {
      try {
        await refreshClassroom();
      } catch {
        // Keep cached data and let the Inbox show its last-updated/error state.
      }
    }
  }
  if (state.settings.gmail) {
    const at = Date.parse(state.gmail?.fetchedAt ?? '');
    if (!Number.isFinite(at) || nowMs - at > SIX_HOURS) {
      try {
        await refreshGmail();
      } catch {
        // Same: cached digest stays visible.
      }
    }
  }
}

export function updateIntegrationSettings(patch: Partial<IntegrationSettings>): void {
  integrationStore.patchSettings(patch);
}

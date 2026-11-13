import { normalizeSettings, type Settings } from '@/domain/settings';
import type { SyncedPreferences } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Preferences are safe to send as-is: the AI key is not part of `Settings`.
 * Keeping this function as the push boundary means a future secret field must
 * be added here before it can reach the network.
 */
export function redactPreferences(settings: Settings): SyncedPreferences {
  return {
    ...settings,
    ai: {
      enabled: settings.ai.enabled,
      provider: settings.ai.provider,
      canReadNotes: settings.ai.canReadNotes,
    },
  };
}

/**
 * Applies a remote preferences document only when it is newer than the local
 * one (LWW). Remote shapes are normalized, so unknown or legacy fields such as
 * a stray `ai.apiKey` never enter the settings store.
 */
export function mergePreferences(local: Settings, remote: unknown): Settings | null {
  if (!isRecord(remote)) return null;
  const normalized = normalizeSettings(remote);
  return normalized.updatedAt > local.updatedAt ? normalized : null;
}

/** True once the local preferences are newer than the remote cursor. */
export function hasPendingPreferences(settings: Settings, since: string): boolean {
  return settings.updatedAt > since;
}

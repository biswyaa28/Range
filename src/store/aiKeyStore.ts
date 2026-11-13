import { secureStorage as defaultSecureStorage } from '@/platform';
import type { SecureStorageAdapter } from '@/platform/types';
import { settingsStore } from './settingsStore';

export const AI_KEY_STORAGE_KEY = 'personalOS_ai_key_v1';

export interface AiKeyState {
  key: string;
  loaded: boolean;
  error: string | null;
}

export interface AiKeyStoreOptions {
  secureStorage?: SecureStorageAdapter;
  /** Returns a plaintext key from an older build exactly once. */
  legacyKey?: () => string | null;
}

type Listener = (state: AiKeyState) => void;

const EMPTY: AiKeyState = { key: '', loaded: false, error: null };

function normalizeKey(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().slice(0, 512) : '';
}

/**
 * Keeps the LLM API key in the platform secure store. The rest of the app only
 * sees it through this in-memory snapshot; it is never written to Settings.
 */
export class AiKeyStore {
  private state: AiKeyState = EMPTY;
  private listeners: Listener[] = [];
  private loadPromise: Promise<void> | null = null;
  private readonly storageOverride: SecureStorageAdapter | null;
  private readonly legacyKey: (() => string | null) | null;

  constructor(options: AiKeyStoreOptions = {}) {
    this.storageOverride = options.secureStorage ?? null;
    this.legacyKey = options.legacyKey ?? null;
  }

  private storage(): SecureStorageAdapter {
    // The platform index swaps this binding during startup, so read it lazily.
    return this.storageOverride ?? defaultSecureStorage;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  get = (): AiKeyState => this.state;

  getKey = (): string => this.state.key;

  hasKey = (): boolean => this.state.key.length > 0;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  };

  load = (): Promise<void> => {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadNow();
    return this.loadPromise;
  };

  private async loadNow(): Promise<void> {
    try {
      let key = normalizeKey(await this.storage().getItem(AI_KEY_STORAGE_KEY));
      if (!key && this.legacyKey) {
        const legacy = normalizeKey(this.legacyKey());
        if (legacy) {
          key = legacy;
          await this.storage().setItem(AI_KEY_STORAGE_KEY, legacy);
        }
      }
      this.state = { key, loaded: true, error: null };
    } catch {
      this.state = {
        key: '',
        loaded: true,
        error: 'Secure storage is unavailable on this device.',
      };
    }
    this.notify();
  }

  setKey = async (value: string): Promise<void> => {
    await this.load();
    const key = normalizeKey(value);

    // Persist before publishing, so a reload cannot observe "saved" while the
    // secure write is still in flight.
    try {
      if (key) await this.storage().setItem(AI_KEY_STORAGE_KEY, key);
      else await this.storage().removeItem(AI_KEY_STORAGE_KEY);
      this.state = { key, loaded: true, error: null };
    } catch {
      // Keep the key usable for this session even when it cannot be persisted.
      this.state = {
        key,
        loaded: true,
        error: 'Could not save the key securely. It will last for this session only.',
      };
    }
    this.notify();
  };

  clear = async (): Promise<void> => {
    await this.setKey('');
  };
}

export const aiKeyStore = new AiKeyStore({
  legacyKey: () => settingsStore.consumeLegacyAiKey(),
});

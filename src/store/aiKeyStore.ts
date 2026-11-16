import { secureStorage as defaultSecureStorage } from '@/platform';
import type { SecureStorageAdapter } from '@/platform/types';
import { settingsStore } from './settingsStore';
import { isVaultValue, openSecret, sealSecret, webVaultCrypto, type VaultCrypto } from './keyVault';

export const AI_KEY_STORAGE_KEY = 'personalOS_ai_key_v1';

export interface AiKeyState {
  key: string;
  loaded: boolean;
  error: string | null;
  /** A passphrase vault is present but has not been unlocked this session. */
  locked: boolean;
  /** Optional passphrase protection is enabled. */
  passphrase: boolean;
}

export interface AiKeyStoreOptions {
  secureStorage?: SecureStorageAdapter;
  /** Returns a plaintext key from an older build exactly once. */
  legacyKey?: () => string | null;
  /** Injectable for tests; defaults to the browser's Web Crypto. */
  keyCrypto?: VaultCrypto;
}

type Listener = (state: AiKeyState) => void;

const EMPTY: AiKeyState = {
  key: '',
  loaded: false,
  error: null,
  locked: false,
  passphrase: false,
};

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
  private readonly keyCrypto: VaultCrypto;
  /** Kept in memory only for the current unlocked session. */
  private sessionPassphrase: string | null = null;

  constructor(options: AiKeyStoreOptions = {}) {
    this.storageOverride = options.secureStorage ?? null;
    this.legacyKey = options.legacyKey ?? null;
    this.keyCrypto = options.keyCrypto ?? webVaultCrypto;
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
      const stored = await this.storage().getItem(AI_KEY_STORAGE_KEY);
      if (isVaultValue(stored)) {
        this.state = {
          key: '',
          loaded: true,
          error: null,
          locked: true,
          passphrase: true,
        };
        this.notify();
        return;
      }
      let key = normalizeKey(stored);
      if (!key && this.legacyKey) {
        const legacy = normalizeKey(this.legacyKey());
        if (legacy) {
          key = legacy;
          await this.storage().setItem(AI_KEY_STORAGE_KEY, legacy);
        }
      }
      this.state = { key, loaded: true, error: null, locked: false, passphrase: false };
    } catch {
      this.state = {
        key: '',
        loaded: true,
        error: 'Secure storage is unavailable on this device.',
        locked: false,
        passphrase: false,
      };
    }
    this.notify();
  }

  setKey = async (value: string): Promise<void> => {
    await this.load();
    const key = normalizeKey(value);
    if (this.state.locked) {
      this.state = {
        ...this.state,
        error: 'Unlock the passphrase vault before replacing the key.',
      };
      this.notify();
      return;
    }

    // Persist before publishing, so a reload cannot observe "saved" while the
    // secure write is still in flight.
    try {
      if (key && this.state.passphrase) {
        if (!this.sessionPassphrase) throw new Error('Passphrase is not in memory');
        await this.storage().setItem(
          AI_KEY_STORAGE_KEY,
          await sealSecret(key, this.sessionPassphrase, this.keyCrypto),
        );
      } else if (key) {
        await this.storage().setItem(AI_KEY_STORAGE_KEY, key);
      } else {
        await this.storage().removeItem(AI_KEY_STORAGE_KEY);
      }
      this.state = {
        key,
        loaded: true,
        error: null,
        locked: false,
        passphrase: key ? this.state.passphrase : false,
      };
      if (!key) this.sessionPassphrase = null;
    } catch {
      // Keep the key usable for this session even when it cannot be persisted.
      this.state = {
        key,
        loaded: true,
        error: 'Could not save the key securely. It will last for this session only.',
        locked: false,
        passphrase: this.state.passphrase,
      };
    }
    this.notify();
  };

  /** Unwraps a stored passphrase vault, keeping the secret in memory only. */
  unlock = async (passphrase: string): Promise<boolean> => {
    await this.load();
    if (!this.state.locked) return true;
    try {
      const value = await this.storage().getItem(AI_KEY_STORAGE_KEY);
      if (!isVaultValue(value)) throw new Error('No passphrase vault');
      const key = normalizeKey(await openSecret(value, passphrase, this.keyCrypto));
      this.sessionPassphrase = passphrase;
      this.state = {
        key,
        loaded: true,
        error: null,
        locked: false,
        passphrase: true,
      };
      this.notify();
      return true;
    } catch {
      this.state = {
        ...this.state,
        locked: true,
        passphrase: true,
        error: 'Could not unlock the key. Check the passphrase and try again.',
      };
      this.notify();
      return false;
    }
  };

  /** Turns on passphrase protection for the key already in the vault. */
  enablePassphrase = async (passphrase: string): Promise<boolean> => {
    await this.load();
    if (!passphrase.trim() || !this.state.key) return false;
    try {
      const sealed = await sealSecret(this.state.key, passphrase, this.keyCrypto);
      await this.storage().setItem(AI_KEY_STORAGE_KEY, sealed);
      this.sessionPassphrase = passphrase;
      this.state = {
        ...this.state,
        error: null,
        locked: false,
        passphrase: true,
      };
    } catch {
      this.state = {
        ...this.state,
        error: 'Could not add passphrase protection to the key.',
      };
      this.notify();
      return false;
    }
    this.notify();
    return true;
  };

  /** Removes the passphrase wrapper and returns to the normal secure store. */
  disablePassphrase = async (): Promise<boolean> => {
    await this.load();
    if (this.state.locked || !this.state.key) return false;
    try {
      await this.storage().setItem(AI_KEY_STORAGE_KEY, this.state.key);
      this.sessionPassphrase = null;
      this.state = { ...this.state, passphrase: false, error: null };
      this.notify();
      return true;
    } catch {
      this.state = {
        ...this.state,
        error: 'Could not remove passphrase protection.',
      };
      this.notify();
      return false;
    }
  };

  /** Forgot the passphrase: delete the wrapped key, keeping no backup. */
  forgetPassphrase = async (): Promise<void> => {
    await this.load();
    try {
      await this.storage().removeItem(AI_KEY_STORAGE_KEY);
    } catch {
      // The in-memory key still clears below.
    }
    this.sessionPassphrase = null;
    this.state = { ...EMPTY, loaded: true };
    this.notify();
  };

  clear = async (): Promise<void> => {
    await this.setKey('');
  };
}

export const aiKeyStore = new AiKeyStore({
  legacyKey: () => settingsStore.consumeLegacyAiKey(),
});

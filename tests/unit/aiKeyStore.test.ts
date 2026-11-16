import { describe, expect, it, vi } from 'vitest';
import { AI_KEY_STORAGE_KEY, AiKeyStore } from '@/store/aiKeyStore';
import type { SecureStorageAdapter } from '@/platform/types';
import { isVaultValue, openSecret, sealSecret, type VaultCrypto } from '@/store/keyVault';

class MemorySecureStorage implements SecureStorageAdapter {
  readonly values = new Map<string, string>();
  failGet = false;
  failSet = false;

  async getItem(key: string): Promise<string | null> {
    if (this.failGet) throw new Error('unavailable');
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failSet) throw new Error('quota');
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe('AiKeyStore', () => {
  it('loads an existing key from secure storage', async () => {
    const storage = new MemorySecureStorage();
    storage.values.set(AI_KEY_STORAGE_KEY, 'AIza-existing');
    const store = new AiKeyStore({ secureStorage: storage });

    await store.load();

    expect(store.get()).toMatchObject({
      key: 'AIza-existing',
      loaded: true,
      error: null,
      locked: false,
      passphrase: false,
    });
    expect(store.hasKey()).toBe(true);
  });

  it('saves, trims and removes the key without touching Settings', async () => {
    const storage = new MemorySecureStorage();
    const store = new AiKeyStore({ secureStorage: storage });
    const seen: string[] = [];
    store.subscribe((state) => seen.push(state.key));

    await store.setKey('  AIza-new-key  ');
    expect(store.getKey()).toBe('AIza-new-key');
    expect(storage.values.get(AI_KEY_STORAGE_KEY)).toBe('AIza-new-key');

    await store.clear();
    expect(store.getKey()).toBe('');
    expect(storage.values.has(AI_KEY_STORAGE_KEY)).toBe(false);
    expect(seen.slice(-2)).toEqual(['AIza-new-key', '']);
  });

  it('migrates a legacy plaintext key once and persists it securely', async () => {
    const storage = new MemorySecureStorage();
    const legacyKey = vi.fn().mockReturnValue('AIza-legacy-key');
    const store = new AiKeyStore({ secureStorage: storage, legacyKey });

    await store.load();
    await store.load();

    expect(store.getKey()).toBe('AIza-legacy-key');
    expect(storage.values.get(AI_KEY_STORAGE_KEY)).toBe('AIza-legacy-key');
    expect(legacyKey).toHaveBeenCalledTimes(1);
  });

  it('does not call the legacy reader when secure storage already has a key', async () => {
    const storage = new MemorySecureStorage();
    storage.values.set(AI_KEY_STORAGE_KEY, 'AIza-current');
    const legacyKey = vi.fn().mockReturnValue('AIza-legacy-key');
    const store = new AiKeyStore({ secureStorage: storage, legacyKey });

    await store.load();

    expect(store.getKey()).toBe('AIza-current');
    expect(legacyKey).not.toHaveBeenCalled();
  });

  it('wraps the key with PBKDF2 and AES-GCM when a passphrase is enabled', async () => {
    const storage = new MemorySecureStorage();
    const calls: unknown[] = [];
    const key = {} as CryptoKey;
    const subtle = {
      importKey: async () => key,
      deriveKey: async (algorithm: unknown) => {
        calls.push(algorithm);
        return key;
      },
      encrypt: async (_algorithm: unknown, _key: unknown, data: Uint8Array) =>
        data.slice().buffer,
      decrypt: async (_algorithm: unknown, _key: unknown, data: Uint8Array) =>
        data.slice().buffer,
    } as unknown as SubtleCrypto;
    const keyCrypto: VaultCrypto = {
      subtle,
      random: (bytes) => new Uint8Array(bytes).fill(7),
    };
    const store = new AiKeyStore({ secureStorage: storage, keyCrypto });

    await store.setKey('AIza-passphrase-key');
    expect(await store.enablePassphrase('correct horse')).toBe(true);
    const sealed = storage.values.get(AI_KEY_STORAGE_KEY) ?? '';
    expect(isVaultValue(sealed)).toBe(true);
    expect(sealed).not.toContain('correct horse');
    expect(calls[0]).toMatchObject({
      name: 'PBKDF2',
      iterations: 310_000,
      hash: 'SHA-256',
    });

    const reloaded = new AiKeyStore({ secureStorage: storage, keyCrypto });
    await reloaded.load();
    expect(reloaded.get()).toMatchObject({ locked: true, passphrase: true, key: '' });
    expect(await reloaded.unlock('correct horse')).toBe(true);
    expect(reloaded.getKey()).toBe('AIza-passphrase-key');
    expect(reloaded.get()).toMatchObject({ locked: false, passphrase: true });
  });

  it('seals and opens a secret with the injectable WebCrypto port', async () => {
    const key = {} as CryptoKey;
    const subtle = {
      importKey: async () => key,
      deriveKey: async () => key,
      encrypt: async (_algorithm: unknown, _key: unknown, data: Uint8Array) =>
        data.slice().buffer,
      decrypt: async (_algorithm: unknown, _key: unknown, data: Uint8Array) =>
        data.slice().buffer,
    } as unknown as SubtleCrypto;
    const keyCrypto: VaultCrypto = {
      subtle,
      random: (bytes) => new Uint8Array(bytes).fill(3),
    };

    const sealed = await sealSecret('secret-value', 'passphrase', keyCrypto);
    expect(isVaultValue(sealed)).toBe(true);
    expect(await openSecret(sealed, 'passphrase', keyCrypto)).toBe('secret-value');
  });

  it('reports unavailable storage and keeps a session-only key on write failure', async () => {
    const storage = new MemorySecureStorage();
    storage.failGet = true;
    const store = new AiKeyStore({ secureStorage: storage });

    await store.load();
    expect(store.get()).toMatchObject({
      key: '',
      loaded: true,
      error: 'Secure storage is unavailable on this device.',
    });

    storage.failGet = false;
    storage.failSet = true;
    await store.setKey('AIza-session');
    expect(store.getKey()).toBe('AIza-session');
    expect(store.get().error).toContain('session only');
  });
});

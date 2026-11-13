import { describe, expect, it, vi } from 'vitest';
import { AI_KEY_STORAGE_KEY, AiKeyStore } from '@/store/aiKeyStore';
import type { SecureStorageAdapter } from '@/platform/types';

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

    expect(store.get()).toEqual({ key: 'AIza-existing', loaded: true, error: null });
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

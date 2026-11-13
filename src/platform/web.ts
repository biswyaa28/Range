import type {
  HapticsAdapter,
  HapticsKind,
  FileSaver,
  StorageAdapter,
  SecureStorageAdapter,
  HealthProvider,
  HealthDataSummary,
} from './types';

const PATTERNS: Record<HapticsKind, number[]> = {
  tap: [8],
  select: [12],
  success: [10, 40, 10],
  warning: [20, 50],
  error: [30, 40, 30, 40, 30],
  impact: [14],
};

function canBuzz(): boolean {
  try {
    return (
      typeof navigator === 'object' &&
      navigator !== null &&
      typeof navigator.vibrate === 'function' &&
      ((navigator.maxTouchPoints || 0) > 0 ||
        /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent || ''))
    );
  } catch {
    return false;
  }
}

function visualPulse(el?: HTMLElement | null): void {
  if (!el || !el.classList || !el.isConnected) return;
  try {
    el.classList.remove('hpt');
    void el.offsetWidth;
    el.classList.add('hpt');
    setTimeout(() => {
      el.classList.remove('hpt');
    }, 220);
  } catch {
    // ignore
  }
}

export class WebHaptics implements HapticsAdapter {
  private vibrate(pattern: number[]): boolean {
    try {
      if (!canBuzz()) return false;
      return !!navigator.vibrate(pattern);
    } catch {
      return false;
    }
  }

  private emit(kind: HapticsKind, target?: HTMLElement | null): void {
    const pattern = PATTERNS[kind] ?? PATTERNS.tap;
    const buzzed = this.vibrate(pattern);
    if (!buzzed && target) {
      visualPulse(target);
    }
  }

  tap(target?: HTMLElement | null): void {
    this.emit('tap', target);
  }

  select(target?: HTMLElement | null): void {
    this.emit('select', target);
  }

  success(target?: HTMLElement | null): void {
    this.emit('success', target);
  }

  warning(target?: HTMLElement | null): void {
    this.emit('warning', target);
  }

  error(target?: HTMLElement | null): void {
    this.emit('error', target);
  }

  impact(target?: HTMLElement | null): void {
    this.emit('impact', target);
  }
}

export class WebFileSaver implements FileSaver {
  async saveFile(blob: Blob, filename: string): Promise<void> {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

export class WebStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }
}

interface StoredSecret {
  iv: string;
  data: string;
}

const SECURE_DB_NAME = 'personalOS_secure_v1';
const SECURE_STORE = 'secrets';
const SECURE_KEY_STORE = 'keys';
const SECURE_KEY_ID = 'vault';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Secure storage request failed'));
  });
}

function openSecureDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(SECURE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SECURE_STORE)) db.createObjectStore(SECURE_STORE);
      if (!db.objectStoreNames.contains(SECURE_KEY_STORE)) db.createObjectStore(SECURE_KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the secure store'));
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Best-effort web vault: secrets are AES-GCM encrypted with a non-extractable
 * key held in IndexedDB. Browsers expose no OS-level protected store, so this is
 * weaker than Keychain/Keystore but never writes plaintext to web storage.
 */
export class WebSecureStorage implements SecureStorageAdapter {
  private db: Promise<IDBDatabase> | null = null;
  private key: Promise<CryptoKey> | null = null;

  private database(): Promise<IDBDatabase> {
    if (!this.db) this.db = openSecureDb();
    return this.db;
  }

  private cryptoKey(): Promise<CryptoKey> {
    if (!this.key) this.key = this.loadKey();
    return this.key;
  }

  private async loadKey(): Promise<CryptoKey> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('Web Crypto is unavailable');
    const db = await this.database();
    const stored = await requestToPromise<CryptoKey | undefined>(
      db.transaction(SECURE_KEY_STORE, 'readonly').objectStore(SECURE_KEY_STORE).get(SECURE_KEY_ID),
    );
    if (stored) return stored;
    const created = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const store = db.transaction(SECURE_KEY_STORE, 'readwrite').objectStore(SECURE_KEY_STORE);
    await requestToPromise(store.put(created, SECURE_KEY_ID));
    return created;
  }

  async getItem(key: string): Promise<string | null> {
    const db = await this.database();
    const record = await requestToPromise<StoredSecret | undefined>(
      db.transaction(SECURE_STORE, 'readonly').objectStore(SECURE_STORE).get(key),
    );
    if (!record) return null;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('Web Crypto is unavailable');
    const plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(record.iv) },
      await this.cryptoKey(),
      fromBase64(record.data),
    );
    return new TextDecoder().decode(plain);
  }

  async setItem(key: string, value: string): Promise<void> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('Web Crypto is unavailable');
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await subtle.encrypt(
      { name: 'AES-GCM', iv },
      await this.cryptoKey(),
      new TextEncoder().encode(value),
    );
    const db = await this.database();
    const store = db.transaction(SECURE_STORE, 'readwrite').objectStore(SECURE_STORE);
    await requestToPromise(
      store.put({ iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) }, key),
    );
  }

  async removeItem(key: string): Promise<void> {
    const db = await this.database();
    const store = db.transaction(SECURE_STORE, 'readwrite').objectStore(SECURE_STORE);
    await requestToPromise(store.delete(key));
  }
}

export class WebHealthProviderStub implements HealthProvider {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async getSummary(_dateISO: string): Promise<HealthDataSummary | null> {
    return null;
  }
}

export const webHaptics = new WebHaptics();
export const webFileSaver = new WebFileSaver();
export const webStorage = new WebStorageAdapter();
export const webSecureStorage = new WebSecureStorage();
export const webHealth = new WebHealthProviderStub();


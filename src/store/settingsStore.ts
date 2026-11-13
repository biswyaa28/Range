import {
  SETTINGS_BACKUP_KEY,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  cloneSettings,
  defaultSettings,
  migrateSettings,
  normalizeSettings,
  patchSettings,
  type Settings,
  type SettingsEnvelope,
  type SettingsPatch,
} from '@/domain/settings';
import { STORAGE_KEY } from '@/domain/types';
import type { Clock } from '@/domain/dates';
import { defaultClock } from '@/domain/dates';
import type { StorageAdapter } from '@/platform/types';
import { storage as defaultStorage } from '@/platform';
import { reportWriteFailure, reportWriteSuccess } from './persistenceStatus';

export type SettingsSubscriber = (settings: Settings) => void;

export interface SettingsReplaceOptions {
  /**
   * Stamp `updatedAt` with the current time. Disable when applying a remote
   * value that already carries its own timestamp.
   */
  stamp?: boolean;
}

export interface SettingsStoreOptions {
  storage?: StorageAdapter;
  clock?: Clock;
  key?: string;
  backupKey?: string;
  /**
   * Where to look for legacy preferences when the dedicated settings key is
   * absent. Defaults to the main app save; pass `null` to skip adoption.
   */
  legacyKey?: string | null;
  debounceMs?: number;
}

interface LoadedSettings {
  settings: Settings;
  persist: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Rescues a key written by older builds before settings are normalized. */
function extractLegacyAiKey(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const data = isRecord(payload['data']) ? payload['data'] : payload;
  const ai = isRecord(data['ai']) ? data['ai'] : null;
  const key = ai?.['apiKey'];
  return typeof key === 'string' && key.trim() ? key.trim().slice(0, 256) : null;
}

export class SettingsStore {
  private data: Settings;
  private subscribers: SettingsSubscriber[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly storage: StorageAdapter;
  private readonly clock: Clock;
  private readonly key: string;
  private readonly backupKey: string;
  private readonly legacyKey: string | null;
  private readonly debounceMs: number;
  private legacyAiKey: string | null = null;

  constructor(options: SettingsStoreOptions = {}) {
    this.storage = options.storage ?? defaultStorage;
    this.clock = options.clock ?? defaultClock;
    this.key = options.key ?? SETTINGS_STORAGE_KEY;
    this.backupKey = options.backupKey ?? SETTINGS_BACKUP_KEY;
    this.legacyKey = options.legacyKey === undefined ? STORAGE_KEY : options.legacyKey;
    this.debounceMs = options.debounceMs ?? 50;

    const loaded = this.load();
    this.data = loaded.settings;
    if (loaded.persist) this.writeNow();
  }

  private read(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private load(): LoadedSettings {
    const raw = this.read(this.key);
    if (raw != null) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!this.legacyAiKey) this.legacyAiKey = extractLegacyAiKey(parsed);
        return { settings: migrateSettings(parsed), persist: true };
      } catch {
        try {
          this.storage.setItem(this.backupKey, raw);
        } catch {
          // ignore backup failure
        }
        // Heal the corrupt key with defaults so the next load is clean.
        return { settings: defaultSettings(), persist: true };
      }
    }

    if (this.legacyKey) {
      const legacyRaw = this.read(this.legacyKey);
      if (legacyRaw != null) {
        try {
          const parsed: unknown = JSON.parse(legacyRaw);
          if (!this.legacyAiKey) this.legacyAiKey = extractLegacyAiKey(parsed);
          return { settings: migrateSettings(parsed), persist: true };
        } catch {
          // A broken main save should not stop preferences from starting.
        }
      }
    }

    return { settings: defaultSettings(), persist: false };
  }

  private writeNow(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const envelope: SettingsEnvelope = {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      data: cloneSettings(this.data),
    };

    try {
      this.storage.setItem(this.key, JSON.stringify(envelope));
      reportWriteSuccess('settings');
    } catch {
      // Never sacrifice the backup key: it holds the only copy of an
      // unreadable save. Keep the in-memory value and try again on the next write.
      reportWriteFailure('settings');
    }
  }

  private notify(): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(this.data);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  private stamp(): void {
    this.data = { ...this.data, updatedAt: this.clock.nowISO() };
  }

  private scheduleFlush(): void {
    if (this.debounceMs <= 0) {
      this.writeNow();
      return;
    }
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.writeNow();
    }, this.debounceMs);
  }

  get(): Settings {
    return this.data;
  }

  /** Returns the old plaintext key once so it can be moved to secure storage. */
  consumeLegacyAiKey(): string | null {
    const key = this.legacyAiKey;
    this.legacyAiKey = null;
    return key;
  }

  set(patch: SettingsPatch): void {
    this.data = patchSettings(this.data, patch);
    this.stamp();
    this.notify();
    this.scheduleFlush();
  }

  update(mutator: (draft: Settings) => void): void {
    const draft = cloneSettings(this.data);
    mutator(draft);
    this.data = normalizeSettings(draft);
    this.stamp();
    this.notify();
    this.scheduleFlush();
  }

  replace(settings: unknown, options: SettingsReplaceOptions = {}): void {
    this.data = normalizeSettings(settings);
    if (options.stamp !== false) this.stamp();
    this.notify();
    this.scheduleFlush();
  }

  reset(): void {
    this.data = defaultSettings();
    this.stamp();
    this.notify();
    this.scheduleFlush();
  }

  subscribe(fn: SettingsSubscriber): () => void {
    if (typeof fn === 'function') {
      this.subscribers.push(fn);
    }
    return () => {
      this.subscribers = this.subscribers.filter((subscriber) => subscriber !== fn);
    };
  }

  flush(): void {
    this.writeNow();
  }
}

export const settingsStore = new SettingsStore();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    try {
      settingsStore.flush();
    } catch {
      // ignore
    }
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try {
          settingsStore.flush();
        } catch {
          // ignore
        }
      }
    });
  }
}

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SETTINGS_BACKUP_KEY,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  defaultSettings,
} from '@/domain/settings';
import { FixedClock } from '@/domain/dates';
import { STORAGE_KEY } from '@/domain/types';
import { SettingsStore } from '@/store/settingsStore';
import { MemoryStorage } from './memoryStorage';

function readEnvelope(storage: MemoryStorage): unknown {
  const raw = storage.getItem(SETTINGS_STORAGE_KEY);
  if (raw == null) return null;
  return JSON.parse(raw) as unknown;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SettingsStore', () => {
  it('starts from defaults and persists a versioned envelope on set', () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore({ storage, legacyKey: null, debounceMs: 0 });

    expect(store.get()).toEqual(defaultSettings());
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();

    store.set({
      theme: 'dark',
      ai: { canReadNotes: true },
      identity: { name: 'Ada', goals: ['exams'] },
    });

    const envelope = readEnvelope(storage) as {
      schemaVersion: number;
      data: Record<string, unknown>;
    };
    expect(envelope.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(envelope.data['theme']).toBe('dark');
    expect(envelope.data['ai']).toEqual({
      enabled: false,
      provider: 'gemini',
      canReadNotes: true,
    });
    expect(envelope.data['identity']).toEqual({
      name: 'Ada',
      role: 'student',
      goals: ['exams'],
    });
  });

  it('reloads persisted settings and keeps them typed', () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore({ storage, legacyKey: null, debounceMs: 0 });
    store.set({ theme: 'light', density: 'compact', cornerRadius: 8 });

    const reloaded = new SettingsStore({ storage, legacyKey: null, debounceMs: 0 });
    expect(reloaded.get().theme).toBe('light');
    expect(reloaded.get().density).toBe('compact');
    expect(reloaded.get().cornerRadius).toBe(8);
    expect(reloaded.get().clockFormat).toBe('24h');
  });

  it('adopts legacy AppState preferences when the dedicated key is absent', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        settings: { theme: 'auto' },
        profile: {
          accent: 'blue',
          customAccent: '',
          haptics: { on: false, level: 'medium', sound: false },
        },
      }),
    );

    const store = new SettingsStore({ storage, debounceMs: 0 });

    expect(store.get().theme).toBe('system');
    expect(store.get().accentColor).toBe('blue');
    expect(store.get().haptics).toBe(false);
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).not.toBeNull();
  });

  it('extracts a legacy AI key without persisting it in Settings', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        data: { ai: { enabled: true, provider: 'gemini', canReadNotes: false, apiKey: 'AIza-legacy' } },
      }),
    );

    const store = new SettingsStore({ storage, legacyKey: null, debounceMs: 0 });

    expect(store.consumeLegacyAiKey()).toBe('AIza-legacy');
    expect(store.get()).not.toHaveProperty('apiKey');
    expect(JSON.stringify(readEnvelope(storage))).not.toContain('AIza-legacy');
  });

  it('backs up a corrupt payload and heals it with defaults', () => {
    const storage = new MemoryStorage();
    const corrupt = '{ broken settings ]';
    storage.setItem(SETTINGS_STORAGE_KEY, corrupt);

    const store = new SettingsStore({ storage, legacyKey: null, debounceMs: 0 });

    expect(store.get()).toEqual(defaultSettings());
    expect(storage.getItem(SETTINGS_BACKUP_KEY)).toBe(corrupt);
    expect(readEnvelope(storage)).toMatchObject({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      data: { theme: 'system' },
    });
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore({ storage, legacyKey: null, debounceMs: 0 });
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    store.set({ theme: 'dark' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));

    unsubscribe();
    store.set({ theme: 'light' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports mutator updates, replacement and reset', () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore({ storage, legacyKey: null, debounceMs: 0 });

    store.update((draft) => {
      draft.theme = 'dark';
      draft.notifications.quietHours.start = '20:15';
      draft.homeWidgets.visible['tasks'] = false;
    });

    expect(store.get().theme).toBe('dark');
    expect(store.get().notifications.quietHours.start).toBe('20:15');
    expect(store.get().homeWidgets.visible['tasks']).toBe(false);

    store.replace({ theme: 'light', cornerRadius: 99 });
    expect(store.get().theme).toBe('light');
    expect(store.get().cornerRadius).toBe(48);

    store.reset();
    expect({ ...store.get(), updatedAt: 'ignored' }).toEqual({
      ...defaultSettings(),
      updatedAt: 'ignored',
    });
  });

  it('stamps local changes and preserves remote timestamps on replace', () => {
    const storage = new MemoryStorage();
    const clock = new FixedClock('2026-04-13T10:00:00.000Z');
    const store = new SettingsStore({ storage, clock, legacyKey: null, debounceMs: 0 });

    store.set({ theme: 'dark' });
    expect(store.get().updatedAt).toBe('2026-04-13T10:00:00.000Z');

    clock.advanceMs(5000);
    store.update((draft) => {
      draft.theme = 'light';
    });
    expect(store.get().updatedAt).toBe('2026-04-13T10:00:05.000Z');

    store.replace(
      {
        ...defaultSettings(),
        theme: 'dark',
        updatedAt: '2026-04-12T09:00:00.000Z',
      },
      { stamp: false },
    );
    expect(store.get().theme).toBe('dark');
    expect(store.get().updatedAt).toBe('2026-04-12T09:00:00.000Z');
  });

  it('debounces writes and flushes immediately', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const store = new SettingsStore({ storage, legacyKey: null });

    store.set({ theme: 'dark' });
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();

    vi.advanceTimersByTime(50);
    expect(readEnvelope(storage)).toMatchObject({ data: { theme: 'dark' } });

    store.set({ theme: 'light' });
    store.flush();
    expect(readEnvelope(storage)).toMatchObject({ data: { theme: 'light' } });
  });
});

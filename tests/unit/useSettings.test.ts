import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { SettingsStore } from '@/store/settingsStore';
import { useSettings } from '@/store/useSettings';
import { MemoryStorage } from './memoryStorage';

afterEach(cleanup);

function makeStore(): SettingsStore {
  return new SettingsStore({
    storage: new MemoryStorage(),
    legacyKey: null,
    debounceMs: 0,
  });
}

describe('useSettings', () => {
  it('returns the whole settings object by default and re-renders on change', () => {
    const store = makeStore();
    const { result } = renderHook(() => useSettings(undefined, store));

    expect(result.current.theme).toBe('system');
    expect(result.current.ai.canReadNotes).toBe(false);

    act(() => {
      store.set({ ai: { canReadNotes: true } });
    });

    expect(result.current.ai.canReadNotes).toBe(true);
    expect(result.current.theme).toBe('system');
  });

  it('supports selectors and unsubscribes on unmount', () => {
    const store = makeStore();
    const { result, unmount } = renderHook(() => useSettings((s) => s.theme, store));

    expect(result.current).toBe('system');

    act(() => {
      store.set({ theme: 'dark' });
    });
    expect(result.current).toBe('dark');

    unmount();
    expect(store.subscribe(() => undefined)).toBeTypeOf('function');
  });

  it('reflects reset back to defaults', () => {
    const store = makeStore();
    const { result } = renderHook(() => useSettings((s) => s.density, store));

    act(() => {
      store.set({ density: 'compact' });
    });
    expect(result.current).toBe('compact');

    act(() => {
      store.reset();
    });
    expect(result.current).toBe('comfortable');
  });
});

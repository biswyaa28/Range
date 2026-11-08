import { beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.fn();
const writeFile = vi.fn();
const invoke = vi.fn();

vi.mock('@tauri-apps/plugin-dialog', () => ({ save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

describe('Tauri platform adapters', () => {
  beforeEach(() => {
    save.mockReset();
    writeFile.mockReset();
    invoke.mockReset();
  });

  it('saves a blob to the user-selected path', async () => {
    save.mockResolvedValue('/Users/test/personal-os-2026-11-08.json');
    const { TauriFileSaver } = await import('@/platform/tauri');
    const blob = new Blob(['{"ok":true}'], { type: 'application/json' });

    await new TauriFileSaver().saveFile(blob, 'personal-os-2026-11-08.json');

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'personal-os-2026-11-08.json',
        filters: [{ name: 'JSON backup', extensions: ['json'] }],
      }),
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/Users/test/personal-os-2026-11-08.json',
      expect.any(Uint8Array),
    );
  });

  it('selects the native platform when Tauri internals are present', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Macintosh',
    });

    const platform = await import('@/platform');
    await platform.initializePlatform();

    expect(platform.isNative()).toBe(true);
    expect(platform.platformName).toBe('macos');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/domain/types';
import { fileSaver } from '@/platform';
import { exportBackup } from '@/store/backupExport';

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Blob read failed'));
    reader.readAsText(blob);
  });
}

describe('exportBackup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes pretty-printed state with the dated filename', async () => {
    const save = vi.spyOn(fileSaver, 'saveFile').mockResolvedValue(undefined);
    const state = defaultState();
    state.profile.name = 'Ada';

    const filename = await exportBackup({ exportAll: () => state }, '2026-11-11');

    expect(filename).toBe('personal-os-2026-11-11.json');
    const [blob, writtenName] = save.mock.calls[0] ?? [];
    expect(writtenName).toBe(filename);
    expect(blob).toBeInstanceOf(Blob);
    const text = await readBlob(blob as Blob);
    expect(text).toContain('\n  "profile"');
    expect((JSON.parse(text) as { profile: { name: string } }).profile.name).toBe('Ada');
  });

  it('propagates file-saver failures to the caller', async () => {
    vi.spyOn(fileSaver, 'saveFile').mockRejectedValue(new Error('blocked'));

    await expect(
      exportBackup({ exportAll: defaultState }, '2026-11-11'),
    ).rejects.toThrow('blocked');
  });
});

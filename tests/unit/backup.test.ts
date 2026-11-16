import { describe, it, expect } from 'vitest';
import {
  CLEAR_CONFIRM_PHRASE,
  exportFilename,
  isClearConfirmation,
  validateBackupText,
} from '@/domain/backup';

describe('backup export naming', () => {
  it('names exports personal-os-YYYY-MM-DD.json', () => {
    expect(exportFilename('2026-04-13')).toBe('personal-os-2026-04-13.json');
  });
});

describe('validateBackupText', () => {
  it('accepts a backup carrying any record list', () => {
    const result = validateBackupText(
      JSON.stringify({ profile: { name: 'Ada' }, tasks: [{ id: 't1' }] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.profile).toEqual({ name: 'Ada' });
      expect(result.data.tasks).toEqual([{ id: 't1' }]);
    }
  });

  it('accepts lists of all four kinds together', () => {
    const result = validateBackupText(
      JSON.stringify({ blocks: [], tasks: [], notes: [], deadlines: [] }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects malformed JSON', () => {
    const result = validateBackupText('{not json');
    expect(result).toEqual({ ok: false, error: 'That file is not valid JSON.' });
  });

  it('rejects primitives, arrays and null', () => {
    for (const text of ['null', '42', '"text"', '[]']) {
      const result = validateBackupText(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('Not a Personal OS backup.');
    }
  });

  it('rejects an object without any record list', () => {
    const result = validateBackupText(JSON.stringify({ profile: { name: 'Ada' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        'Not a Personal OS backup — expected blocks, tasks, notes, deadlines or habits.',
      );
    }
  });

  it('rejects a field that is present but not a list', () => {
    const result = validateBackupText(JSON.stringify({ blocks: {}, tasks: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Backup field "blocks" is not a list.');
  });
});

describe('typed clear confirmation', () => {
  it('matches case-insensitively and trims whitespace', () => {
    expect(CLEAR_CONFIRM_PHRASE).toBe('clear');
    expect(isClearConfirmation('clear')).toBe(true);
    expect(isClearConfirmation('  CLEAR  ')).toBe(true);
    expect(isClearConfirmation('Clear')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isClearConfirmation('')).toBe(false);
    expect(isClearConfirmation('yes')).toBe(false);
    expect(isClearConfirmation('clear all')).toBe(false);
  });
});

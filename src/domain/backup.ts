/**
 * Pure helpers for the Data section: export naming, backup validation and
 * the typed confirmation phrase used before a full wipe.
 */

export const CLEAR_CONFIRM_PHRASE = 'clear';

export const DELETE_CLOUD_CONFIRM_PHRASE = 'DELETE';

export const BACKUP_LIST_KEYS = ['blocks', 'tasks', 'notes', 'deadlines'] as const;

export type BackupListKey = (typeof BACKUP_LIST_KEYS)[number];

export interface BackupValidationOk {
  ok: true;
  data: Record<string, unknown>;
}

export interface BackupValidationError {
  ok: false;
  error: string;
}

export type BackupValidation = BackupValidationOk | BackupValidationError;

/** "personal-os-YYYY-MM-DD.json" */
export function exportFilename(iso: string): string {
  return `personal-os-${iso}.json`;
}

/**
 * Accepts only a parsed JSON object that carries at least one of the four
 * record lists, mirroring the legacy import guard.
 */
export function validateBackupText(text: string): BackupValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Not a Personal OS backup.' };
  }

  const data = parsed as Record<string, unknown>;
  const hasList = BACKUP_LIST_KEYS.some((key) => Array.isArray(data[key]));
  if (!hasList) {
    return {
      ok: false,
      error: 'Not a Personal OS backup — expected blocks, tasks, notes or deadlines.',
    };
  }

  const malformed = BACKUP_LIST_KEYS.find(
    (key) => data[key] !== undefined && !Array.isArray(data[key]),
  );
  if (malformed) {
    return { ok: false, error: `Backup field "${malformed}" is not a list.` };
  }

  return { ok: true, data };
}

export function isClearConfirmation(value: string): boolean {
  return value.trim().toLowerCase() === CLEAR_CONFIRM_PHRASE;
}

/** Case-sensitive: deleting the cloud copy is irreversible. */
export function isDeleteCloudConfirmation(value: string): boolean {
  return value.trim() === DELETE_CLOUD_CONFIRM_PHRASE;
}

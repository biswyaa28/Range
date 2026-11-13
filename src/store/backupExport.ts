import { exportFilename } from '@/domain/backup';
import { todayISO } from '@/domain/dates';
import type { AppState } from '@/domain/types';
import { fileSaver } from '@/platform';
import { store } from './store';

export const BACKUP_MIME_TYPE = 'application/json';

export interface BackupExportSource {
  exportAll(): AppState;
}

/**
 * Serializes the in-memory state and writes it through the platform file saver
 * (download on web, share sheet on mobile, save dialog on desktop). Resolves
 * with the filename used; callers own the user-facing feedback.
 */
export async function exportBackup(
  source: BackupExportSource = store,
  today: string = todayISO(),
): Promise<string> {
  const json = JSON.stringify(source.exportAll(), null, 2);
  const filename = exportFilename(today);
  await fileSaver.saveFile(new Blob([json], { type: BACKUP_MIME_TYPE }), filename);
  return filename;
}

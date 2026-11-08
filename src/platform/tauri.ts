import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import type { FileSaver, HapticsAdapter, HapticsKind } from './types';

export class TauriFileSaver implements FileSaver {
  async saveFile(blob: Blob, filename: string): Promise<void> {
    const path = await save({
      defaultPath: filename,
      filters: [{ name: 'JSON backup', extensions: ['json'] }],
    });
    if (!path) return;
    await writeFile(path, new Uint8Array(await new Response(blob).arrayBuffer()));
  }
}

export class TauriHaptics implements HapticsAdapter {
  private emit(kind: HapticsKind): void {
    void invoke('haptic', { kind });
  }

  tap(): void {
    this.emit('tap');
  }

  select(): void {
    this.emit('select');
  }

  success(): void {
    this.emit('success');
  }

  warning(): void {
    this.emit('warning');
  }

  error(): void {
    this.emit('error');
  }

  impact(): void {
    this.emit('impact');
  }
}

export const tauriFileSaver = new TauriFileSaver();
export const tauriHaptics = new TauriHaptics();

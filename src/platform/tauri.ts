import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import type { FileSaver, HapticsAdapter, HapticsKind, SecureStorageAdapter } from './types';

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

/**
 * macOS Keychain-backed secret storage. The Rust side owns the keyring entry;
 * this adapter only forwards get/set/remove calls.
 */
export const tauriSecureStorage: SecureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    return (await invoke<string | null>('secure_storage_get', { key })) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await invoke('secure_storage_set', { key, value });
  },
  async removeItem(key: string): Promise<void> {
    await invoke('secure_storage_remove', { key });
  },
};

export const tauriFileSaver = new TauriFileSaver();
export const tauriHaptics = new TauriHaptics();

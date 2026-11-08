import { webHaptics, webFileSaver, webStorage, webHealth } from './web';
import type { HapticsAdapter, FileSaver, StorageAdapter, HealthProvider } from './types';

export * from './types';

// Default platform implementation is Web (can be swapped for native or desktop at build/runtime)
export let haptics: HapticsAdapter = webHaptics;
export let fileSaver: FileSaver = webFileSaver;
export const storage: StorageAdapter = webStorage;
export const health: HealthProvider = webHealth;

export let platformName: 'web' | 'macos' = 'web';
let native = false;

export function isNative(): boolean {
  return native;
}

export async function initializePlatform(): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !('__TAURI_INTERNALS__' in window) ||
    native
  ) {
    return;
  }

  const module = await import(/* @vite-ignore */ './tauri');
  const userAgent = window.navigator.userAgent;
  if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS X')) {
    platformName = 'macos';
  }
  native = true;
  haptics = module.tauriHaptics;
  fileSaver = module.tauriFileSaver;
}


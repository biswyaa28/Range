import { webHaptics, webFileSaver, webStorage, webHealth } from './web';
import type { HapticsAdapter, FileSaver, StorageAdapter, HealthProvider } from './types';

export * from './types';

// Default platform implementation is Web (can be swapped for native or desktop at build/runtime)
export let haptics: HapticsAdapter = webHaptics;
export let fileSaver: FileSaver = webFileSaver;
export const storage: StorageAdapter = webStorage;
export const health: HealthProvider = webHealth;

export let platformName: 'web' | 'macos' | 'android' = 'web';
let native = false;

export function isNative(): boolean {
  return native;
}

export async function initializePlatform(): Promise<void> {
  if (typeof window === 'undefined' || native) {
    return;
  }

  // 1. Capacitor native check
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  const isCapNative = Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());

  if (isCapNative) {
    const module = await import(/* @vite-ignore */ './capacitor');
    platformName = 'android';
    native = true;
    haptics = module.capacitorHaptics;
    fileSaver = module.capacitorFileSaver;
    module.initBackButton();
    module.initFocusWakeLock();
    module.initAppearanceAndKeyboard();
    return;
  }

  // 2. Tauri desktop check
  if ('__TAURI_INTERNALS__' in window) {
    const module = await import(/* @vite-ignore */ './tauri');
    const userAgent = window.navigator.userAgent;
    if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS X')) {
      platformName = 'macos';
    }
    native = true;
    haptics = module.tauriHaptics;
    fileSaver = module.tauriFileSaver;
  }
}

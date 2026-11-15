import { webHaptics, webFileSaver, webStorage, webSecureStorage, webHealth } from './web';
import {
  capacitorNotifications,
  tauriNotifications,
  webNotifications,
} from './notifications';
import type {
  FileSaver,
  HapticsAdapter,
  StorageAdapter,
  SecureStorageAdapter,
  HealthProvider,
  NotificationAdapter,
} from './types';

export * from './types';

// Default platform implementation is Web (can be swapped for native or desktop at build/runtime)
export let haptics: HapticsAdapter = webHaptics;
export let fileSaver: FileSaver = webFileSaver;
export const storage: StorageAdapter = webStorage;
export let secureStorage: SecureStorageAdapter = webSecureStorage;
export let health: HealthProvider = webHealth;
export let notifications: NotificationAdapter = webNotifications;

export type PlatformName = 'web' | 'macos' | 'windows' | 'linux' | 'android';

export let platformName: PlatformName = 'web';
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
    secureStorage = module.capacitorSecureStorage;
    health = module.capacitorHealth;
    notifications = capacitorNotifications;
    module.initBackButton();
    module.initFocusWakeLock();
    module.initDeepLinks();
    module.initAppearanceAndKeyboard();
    return;
  }

  // 2. Tauri desktop check
  if ('__TAURI_INTERNALS__' in window) {
    const module = await import(/* @vite-ignore */ './tauri');
    const userAgent = window.navigator.userAgent;
    if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS X')) {
      platformName = 'macos';
    } else if (userAgent.includes('Windows')) {
      platformName = 'windows';
    } else {
      platformName = 'linux';
    }
    native = true;
    haptics = module.tauriHaptics;
    fileSaver = module.tauriFileSaver;
    secureStorage = module.tauriSecureStorage;
    notifications = tauriNotifications;
    // Native Google sign-in runs through googleAuth (Rust loopback flow); the
    // Firebase SDK still owns the session.
  }
}

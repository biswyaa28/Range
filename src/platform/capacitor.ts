import { App as CapApp } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style as StatusBarStyle } from '@capacitor/status-bar';
import { store as defaultStore, PersonalStore } from '@/store';
import { isFocusModeOpen, closeFocusMode, subscribeFocusMode } from '@/features/focus/focusModeBus';
import { isPaletteOpen, closePalette } from '@/features/palette/paletteBus';
import type { FileSaver, HapticsAdapter, StorageAdapter } from './types';
import { webStorage } from './web';

export class CapacitorHaptics implements HapticsAdapter {
  constructor(private currentStore: PersonalStore = defaultStore) {}

  setStore(store: PersonalStore): void {
    this.currentStore = store;
  }

  private isEnabled(): boolean {
    try {
      const state = this.currentStore.get();
      return state?.profile?.haptics?.on !== false;
    } catch {
      return true;
    }
  }

  private getLevel(): 'light' | 'medium' | 'strong' {
    try {
      const state = this.currentStore.get();
      const level = state?.profile?.haptics?.level;
      if (level === 'light' || level === 'medium' || level === 'strong') {
        return level;
      }
      return 'medium';
    } catch {
      return 'medium';
    }
  }

  tap(): void {
    if (!this.isEnabled()) return;
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  select(): void {
    if (!this.isEnabled()) return;
    void Haptics.selectionStart().catch(() => {});
  }

  success(): void {
    if (!this.isEnabled()) return;
    void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  }

  warning(): void {
    if (!this.isEnabled()) return;
    void Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  }

  error(): void {
    if (!this.isEnabled()) return;
    void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
  }

  impact(): void {
    if (!this.isEnabled()) return;
    const level = this.getLevel();
    const style = level === 'strong' ? ImpactStyle.Heavy : ImpactStyle.Medium;
    void Haptics.impact({ style }).catch(() => {});
  }
}

export class CapacitorFileSaver implements FileSaver {
  async saveFile(blob: Blob, filename: string): Promise<void> {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const commaIndex = result.indexOf(',');
          resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        } else {
          reject(new Error('Failed to read blob as base64'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('Blob read error'));
      reader.readAsDataURL(blob);
    });

    const writeResult = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    });

    await Share.share({
      title: filename,
      url: writeResult.uri,
      dialogTitle: 'Save Personal OS backup',
    });
  }
}

let backButtonInitialized = false;
let wakeLockInitialized = false;
let appearanceInitialized = false;
let wakeLockSentinel: { release: () => Promise<void> } | null = null;

export function handleHardwareBackButton(options?: {
  closeModal?: () => boolean;
  historyBack?: () => void;
  minimize?: () => Promise<void>;
}): boolean {
  if (options?.closeModal) {
    if (options.closeModal()) return true;
  } else {
    // 1. Palette
    if (isPaletteOpen()) {
      closePalette();
      return true;
    }

    // 2. Focus mode
    if (isFocusModeOpen()) {
      closeFocusMode();
      return true;
    }

    // 3. Open popover / modal / dialog
    const escapeTarget = document.querySelector<HTMLElement>(
      '[role="dialog"], [data-popover], .modal, .modal-backdrop',
    );
    if (escapeTarget) {
      const closeBtn = escapeTarget.querySelector<HTMLElement>(
        '[data-action="close"], .btn-close, [aria-label*="Close" i]',
      );
      if (closeBtn) {
        closeBtn.click();
        return true;
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    }
  }

  // 4. History back in hash routes
  const currentHash = typeof window !== 'undefined' ? window.location.hash : '';
  const isRootRoute = !currentHash || currentHash === '#' || currentHash === '#home';

  if (!isRootRoute) {
    if (options?.historyBack) {
      options.historyBack();
    } else if (typeof window !== 'undefined') {
      window.history.back();
    }
    return true;
  }

  // 5. Minimize app
  if (options?.minimize) {
    void options.minimize();
  } else {
    void CapApp.minimizeApp().catch(() => {});
  }
  return false;
}

export function initBackButton(): void {
  if (backButtonInitialized) return;
  backButtonInitialized = true;

  void CapApp.addListener('backButton', () => {
    handleHardwareBackButton();
  });
}

async function requestWakeLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    const nav = navigator as unknown as {
      wakeLock: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    wakeLockSentinel = await nav.wakeLock.request('screen');
  } catch {
    wakeLockSentinel = null;
  }
}

async function releaseWakeLock(): Promise<void> {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      // ignore
    } finally {
      wakeLockSentinel = null;
    }
  }
}

export function initFocusWakeLock(): void {
  if (wakeLockInitialized) return;
  wakeLockInitialized = true;

  if (isFocusModeOpen()) {
    void requestWakeLock();
  }

  subscribeFocusMode(() => {
    if (isFocusModeOpen()) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isFocusModeOpen()) {
        void requestWakeLock();
      }
    });
  }
}

export function applyThemeToStatusBar(isDark: boolean): void {
  const style = isDark ? StatusBarStyle.Dark : StatusBarStyle.Light;
  void StatusBar.setStyle({ style }).catch(() => {});
  void StatusBar.setBackgroundColor({ color: isDark ? '#0A0A0B' : '#F5F5F7' }).catch(() => {});
}

export function initAppearanceAndKeyboard(store: PersonalStore = defaultStore): void {
  if (appearanceInitialized) return;
  appearanceInitialized = true;

  void Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => {});
  void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});

  const updateStatus = () => {
    try {
      const state = store.get();
      const themePref = state?.settings?.theme ?? 'auto';
      const systemDark =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = themePref === 'dark' || (themePref === 'auto' && systemDark);
      applyThemeToStatusBar(isDark);
    } catch {
      applyThemeToStatusBar(true);
    }
  };

  updateStatus();
  store.subscribe(updateStatus);

  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateStatus);
    } catch {
      // ignore
    }
  }
}

export const capacitorStorage: StorageAdapter = webStorage;
export const capacitorHaptics = new CapacitorHaptics();
export const capacitorFileSaver = new CapacitorFileSaver();


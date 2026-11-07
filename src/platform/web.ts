import type {
  HapticsAdapter,
  HapticsKind,
  FileSaver,
  StorageAdapter,
  HealthProvider,
  HealthDataSummary,
} from './types';

const PATTERNS: Record<HapticsKind, number[]> = {
  tap: [8],
  select: [12],
  success: [10, 40, 10],
  warning: [20, 50],
  error: [30, 40, 30, 40, 30],
  impact: [14],
};

function canBuzz(): boolean {
  try {
    return (
      typeof navigator === 'object' &&
      navigator !== null &&
      typeof navigator.vibrate === 'function' &&
      ((navigator.maxTouchPoints || 0) > 0 ||
        /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent || ''))
    );
  } catch {
    return false;
  }
}

function visualPulse(el?: HTMLElement | null): void {
  if (!el || !el.classList || !el.isConnected) return;
  try {
    el.classList.remove('hpt');
    void el.offsetWidth;
    el.classList.add('hpt');
    setTimeout(() => {
      el.classList.remove('hpt');
    }, 220);
  } catch {
    // ignore
  }
}

export class WebHaptics implements HapticsAdapter {
  private vibrate(pattern: number[]): boolean {
    try {
      if (!canBuzz()) return false;
      return !!navigator.vibrate(pattern);
    } catch {
      return false;
    }
  }

  private emit(kind: HapticsKind, target?: HTMLElement | null): void {
    const pattern = PATTERNS[kind] ?? PATTERNS.tap;
    const buzzed = this.vibrate(pattern);
    if (!buzzed && target) {
      visualPulse(target);
    }
  }

  tap(target?: HTMLElement | null): void {
    this.emit('tap', target);
  }

  select(target?: HTMLElement | null): void {
    this.emit('select', target);
  }

  success(target?: HTMLElement | null): void {
    this.emit('success', target);
  }

  warning(target?: HTMLElement | null): void {
    this.emit('warning', target);
  }

  error(target?: HTMLElement | null): void {
    this.emit('error', target);
  }

  impact(target?: HTMLElement | null): void {
    this.emit('impact', target);
  }
}

export class WebFileSaver implements FileSaver {
  async saveFile(blob: Blob, filename: string): Promise<void> {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

export class WebStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }
}

export class WebHealthProviderStub implements HealthProvider {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async getSummary(_dateISO: string): Promise<HealthDataSummary | null> {
    return null;
  }
}

export const webHaptics = new WebHaptics();
export const webFileSaver = new WebFileSaver();
export const webStorage = new WebStorageAdapter();
export const webHealth = new WebHealthProviderStub();

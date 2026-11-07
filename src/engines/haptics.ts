import type { HapticsAdapter, HapticsKind } from '@/platform/types';
import { haptics as platformHaptics } from '@/platform';
import { store as defaultStore, PersonalStore } from '@/store';

export type HapticsLevel = 'light' | 'medium' | 'strong';

export interface HapticsConfig {
  on: boolean;
  level: HapticsLevel;
  sound: boolean;
}

const PATTERNS: Record<HapticsKind, number[]> = {
  tap: [8],
  select: [12],
  success: [10, 40, 10],
  warning: [20, 50],
  error: [30, 40, 30, 40, 30],
  impact: [14],
};

const LEVELS: Record<HapticsLevel, number> = {
  light: 0.55,
  medium: 1,
  strong: 1.6,
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

function vibrate(pattern: number[], mult: number): boolean {
  try {
    if (!canBuzz()) return false;
    return !!navigator.vibrate(
      pattern.map((ms) => Math.max(1, Math.round(ms * mult))),
    );
  } catch {
    return false;
  }
}

let audioCtx: AudioContext | null = null;

function softClick(): void {
  try {
    const AudioContextClass =
      typeof window !== 'undefined'
        ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : null;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      // Don't auto-create running context without user interaction; if created, check state
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state !== 'running') return;

    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 1850;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.028, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.04);
  } catch {
    // Web audio optional click never throws
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

class HapticsEngine implements HapticsAdapter {
  private customAdapter: HapticsAdapter | null = null;
  private currentStore: PersonalStore = defaultStore;

  setAdapter(adapter: HapticsAdapter | null): void {
    this.customAdapter = adapter;
  }

  setStore(store: PersonalStore): void {
    this.currentStore = store;
  }

  config(): HapticsConfig {
    try {
      const state = this.currentStore.get();
      const h = state?.profile?.haptics;
      return {
        on: h?.on !== false,
        level: h?.level && ['light', 'medium', 'strong'].includes(h.level) ? h.level : 'medium',
        sound: Boolean(h?.sound),
      };
    } catch {
      return { on: true, level: 'medium', sound: false };
    }
  }

  emit(kind: HapticsKind, el?: HTMLElement | null): void {
    try {
      const cfg = this.config();
      if (!cfg.on) return;

      const pattern = PATTERNS[kind] ?? PATTERNS.tap;
      const mult = LEVELS[cfg.level] ?? 1;
      let delivered = false;

      const targetAdapter = this.customAdapter ?? platformHaptics;
      if (targetAdapter && typeof targetAdapter[kind] === 'function') {
        try {
          targetAdapter[kind](el);
          delivered = true;
        } catch {
          // fallback to vibrate
        }
      }

      if (!delivered) {
        delivered = vibrate(pattern, mult);
      }
      if (!delivered && el) {
        visualPulse(el);
      }
      if (cfg.sound) {
        softClick();
      }
    } catch {
      // Haptics never throws
    }
  }

  tap(el?: HTMLElement | null): void {
    this.emit('tap', el);
  }

  select(el?: HTMLElement | null): void {
    this.emit('select', el);
  }

  success(el?: HTMLElement | null): void {
    this.emit('success', el);
  }

  warning(el?: HTMLElement | null): void {
    this.emit('warning', el);
  }

  error(el?: HTMLElement | null): void {
    this.emit('error', el);
  }

  impact(el?: HTMLElement | null): void {
    this.emit('impact', el);
  }
}

export const Haptics = new HapticsEngine();


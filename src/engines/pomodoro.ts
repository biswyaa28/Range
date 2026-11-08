/**
 * Headless Pomodoro timer.
 *
 * The engine owns only clock math. It never touches the DOM, storage or React.
 * Elapsed time is measured from timestamps rather than counted ticks, so a
 * throttled background tab cannot make the timer drift.
 */

export type PomodoroMode = 'work' | 'break';

export interface PomodoroSnapshot {
  mode: PomodoroMode;
  running: boolean;
  remainingMs: number;
  totalMs: number;
  workMin: number;
  breakMin: number;
}

export interface PomodoroSessionEnd {
  /** Mode that just ended. */
  mode: PomodoroMode;
  /** Work minutes credited to the session (0 for breaks). */
  minutes: number;
}

export interface PomodoroOptions {
  workMin?: number;
  breakMin?: number;
  /** Current wall-clock milliseconds; injectable for tests. */
  now?: () => number;
  /** Called once per completed work/break block. */
  onSessionEnd?: (info: PomodoroSessionEnd) => void;
  /** Called once when the timer transitions from paused to running. */
  onStart?: () => void;
}

export const MIN_WORK_MIN = 5;
export const MAX_WORK_MIN = 90;
export const MIN_BREAK_MIN = 5;
export const MAX_BREAK_MIN = 30;

function clampMinutes(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export class PomodoroEngine {
  private mode: PomodoroMode = 'work';
  private running = false;
  private remainingMs: number;
  private workMin: number;
  private breakMin: number;
  private lastAt = 0;
  private readonly now: () => number;
  private onSessionEnd: ((info: PomodoroSessionEnd) => void) | null;
  private onStart: (() => void) | null;
  private sessionListeners = new Set<(info: PomodoroSessionEnd) => void>();
  private listeners = new Set<() => void>();
  private holdOnComplete = false;
  private snapshot: PomodoroSnapshot;

  constructor(options: PomodoroOptions = {}) {
    this.workMin = clampMinutes(options.workMin ?? 25, MIN_WORK_MIN, MAX_WORK_MIN);
    this.breakMin = clampMinutes(options.breakMin ?? 5, MIN_BREAK_MIN, MAX_BREAK_MIN);
    this.now = options.now ?? (() => Date.now());
    this.onSessionEnd = options.onSessionEnd ?? null;
    this.onStart = options.onStart ?? null;
    this.remainingMs = this.workMin * 60_000;
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = (): PomodoroSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Extra completion observers (Focus Mode) without stealing the runtime callback. */
  onSessionComplete(listener: (info: PomodoroSessionEnd) => void): () => void {
    this.sessionListeners.add(listener);
    return () => {
      this.sessionListeners.delete(listener);
    };
  }

  setHoldOnComplete(hold: boolean): void {
    this.holdOnComplete = hold;
  }

  setCallbacks(callbacks: {
    onSessionEnd?: (info: PomodoroSessionEnd) => void;
    onStart?: () => void;
  }): void {
    this.onSessionEnd = callbacks.onSessionEnd ?? null;
    this.onStart = callbacks.onStart ?? null;
  }

  get workMinutes(): number {
    return this.workMin;
  }

  get breakMinutes(): number {
    return this.breakMin;
  }

  /** Keeps configured durations in sync with settings without resetting a running timer. */
  setDurations(workMin: number, breakMin: number): void {
    const nextWork = clampMinutes(workMin, MIN_WORK_MIN, MAX_WORK_MIN);
    const nextBreak = clampMinutes(breakMin, MIN_BREAK_MIN, MAX_BREAK_MIN);
    if (nextWork === this.workMin && nextBreak === this.breakMin) return;
    const wasAtFull = this.remainingMs >= this.totalMs - 1000;
    this.workMin = nextWork;
    this.breakMin = nextBreak;
    if (!this.running && wasAtFull) this.remainingMs = this.totalMs;
    this.emit();
  }

  get totalMs(): number {
    return (this.mode === 'work' ? this.workMin : this.breakMin) * 60_000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastAt = this.now();
    this.onStart?.();
    this.emit();
  }

  pause(): void {
    if (!this.running) return;
    this.advance(this.now());
    this.running = false;
    this.emit();
  }

  toggle(): void {
    if (this.running) this.pause();
    else this.start();
  }

  reset(): void {
    this.running = false;
    this.mode = 'work';
    this.remainingMs = this.totalMs;
    this.emit();
  }

  skip(): void {
    this.running = false;
    this.mode = this.mode === 'work' ? 'break' : 'work';
    this.remainingMs = this.totalMs;
    this.emit();
  }

  addMinutes(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes === 0) return;
    this.remainingMs = Math.max(0, this.remainingMs + minutes * 60_000);
    this.emit();
  }

  /** Applies elapsed wall-clock time. Returns true when at least one block ended. */
  tick(nowMs: number = this.now()): boolean {
    if (!this.running) return false;
    const elapsed = Math.max(0, nowMs - this.lastAt);
    this.lastAt = nowMs;
    if (elapsed === 0) return false;
    return this.advance(nowMs, elapsed);
  }

  private advance(nowMs: number, elapsed = Math.max(0, nowMs - this.lastAt)): boolean {
    this.remainingMs -= elapsed;
    let completed = false;

    // Carry overshoot into the next block so a long throttled gap stays accurate.
    for (let guard = 0; guard < 1000 && this.remainingMs <= 0; guard++) {
      const overshoot = -this.remainingMs;
      const ended = this.mode;
      const minutes = ended === 'work' ? this.workMin : 0;
      completed = true;
      this.onSessionEnd?.({ mode: ended, minutes });
      for (const listener of this.sessionListeners) {
        try {
          listener({ mode: ended, minutes });
        } catch {
          // completion observers must not break the timer
        }
      }
      this.mode = ended === 'work' ? 'break' : 'work';
      this.remainingMs = this.totalMs - overshoot;
      if (this.holdOnComplete) {
        this.running = false;
        this.remainingMs = this.totalMs;
        break;
      }
      if (!this.running || this.remainingMs > 0) break;
    }

    this.lastAt = nowMs;
    this.emit();
    return completed;
  }

  private buildSnapshot(): PomodoroSnapshot {
    return {
      mode: this.mode,
      running: this.running,
      remainingMs: Math.max(0, this.remainingMs),
      totalMs: this.totalMs,
      workMin: this.workMin,
      breakMin: this.breakMin,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // subscriber errors must not break the timer
      }
    }
  }
}

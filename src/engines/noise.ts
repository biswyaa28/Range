/**
 * Headless ambient-noise engine built on the Web Audio API.
 *
 * Noise is synthesised live — no files, no network. White, pink and brown
 * buffers are 4-second palindromes so looping has no wrap click. Every entry
 * point that creates an AudioContext is called from a user gesture; browsers
 * without Web Audio simply keep the engine silent.
 */

export type NoiseType = 'white' | 'pink' | 'brown';

export const NOISE_TYPES: NoiseType[] = ['white', 'pink', 'brown'];

export const NOISE_BASE_GAIN: Record<NoiseType, number> = {
  white: 0.5,
  pink: 2.4,
  brown: 0.55,
};

export interface NoiseSnapshot {
  available: boolean;
  channels: Record<NoiseType, boolean>;
  volumes: Record<NoiseType, number>;
  master: number;
  sleepEndMs: number;
  sleepMin: number;
}

export interface NoiseOptions {
  /** Injectable random source keeps buffer tests deterministic. */
  random?: () => number;
  /** Injectable wall clock for sleep-timer tests. */
  now?: () => number;
  audioContext?: () => AudioContext | null;
  master?: number;
  volumes?: Partial<Record<NoiseType, number>>;
}

interface Channel {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

const SAMPLE_RATE_FALLBACK = 44_100;
const LOOP_SECONDS = 4;
const SLEEP_FADE_MS = 30_000;

/**
 * Builds one seamless noise loop. The second half mirrors the first, so
 * `samples[i] === samples[length - 1 - i]` and the last sample equals the
 * first — no discontinuity at the loop seam.
 */
export function generateNoiseSamples(
  type: NoiseType,
  length: number,
  random: () => number = Math.random,
): Float32Array {
  const size = Math.max(2, Math.floor(length));
  const samples = new Float32Array(size);
  const half = size >> 1;

  if (type === 'white') {
    for (let i = 0; i < half; i++) samples[i] = random() * 2 - 1;
  } else if (type === 'pink') {
    // Paul Kellet's refined pink-noise filter.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < half; i++) {
      const w = random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      samples[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.09;
      b6 = w * 0.115926;
    }
  } else {
    // Brown: leaky integrator with gain compensation.
    let last = 0;
    for (let i = 0; i < half; i++) {
      const w = random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      samples[i] = last * 3.5;
    }
  }

  for (let i = 0; i < size; i++) {
    if (i >= half) {
      const mirrored = samples[size - 1 - i];
      samples[i] = mirrored ?? 0;
    }
    const value = samples[i] ?? 0;
    samples[i] = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  }

  return samples;
}

function defaultAudioContextFactory(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

export class NoiseEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<NoiseType, AudioBuffer>();
  private channels = new Map<NoiseType, Channel>();
  private volumes: Record<NoiseType, number> = { white: 50, pink: 50, brown: 50 };
  private masterVolume: number;
  private sleepEndMs = 0;
  private sleepMin = 0;
  private sleepFade = false;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly audioFactory: () => AudioContext | null;
  private listeners = new Set<() => void>();
  private snapshot: NoiseSnapshot;

  constructor(options: NoiseOptions = {}) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => Date.now());
    this.audioFactory = options.audioContext ?? defaultAudioContextFactory;
    this.masterVolume = options.master ?? 60;
    if (options.volumes) {
      this.volumes = { ...this.volumes, ...options.volumes };
    }
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = (): NoiseSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get available(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    return Boolean(w.AudioContext ?? w.webkitAudioContext);
  }

  setVolumes(volumes: Partial<Record<NoiseType, number>>): void {
    for (const type of NOISE_TYPES) {
      const next = volumes[type];
      if (typeof next === 'number' && Number.isFinite(next)) {
        this.volumes[type] = Math.max(0, Math.min(100, next));
      }
    }
    this.emit();
  }

  /**
   * Creates the AudioContext on first use. Call this only from a user gesture
   * (start, toggle, chime after a gesture-started session).
   */
  ensureContext(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }
    const ctx = this.audioFactory();
    if (!ctx) return null;
    try {
      const master = ctx.createGain();
      master.gain.value = Math.max(0.0001, this.masterVolume / 100);
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.masterGain = master;
      const sampleRate = ctx.sampleRate || SAMPLE_RATE_FALLBACK;
      for (const type of NOISE_TYPES) {
        const length = Math.floor(sampleRate * LOOP_SECONDS);
        const buffer = ctx.createBuffer(1, length, sampleRate);
        buffer.getChannelData(0).set(generateNoiseSamples(type, length, this.random));
        this.buffers.set(type, buffer);
      }
      this.emit();
      return ctx;
    } catch {
      this.ctx = null;
      this.masterGain = null;
      return null;
    }
  }

  isPlaying(type: NoiseType): boolean {
    return this.channels.has(type);
  }

  toggle(type: NoiseType): boolean {
    if (this.channels.has(type)) {
      this.stopChannel(type);
      return false;
    }
    return this.startChannel(type);
  }

  startChannel(type: NoiseType): boolean {
    const ctx = this.ensureContext();
    if (!ctx || this.channels.has(type)) return false;
    const buffer = this.buffers.get(type);
    if (!buffer) return false;
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value =
        (this.volumes[type] / 100) * NOISE_BASE_GAIN[type];
      src.connect(gain);
      gain.connect(this.masterGain ?? ctx.destination);
      src.start();
      this.channels.set(type, { src, gain });
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  stopChannel(type: NoiseType): void {
    const channel = this.channels.get(type);
    if (!channel) return;
    this.channels.delete(type);
    try {
      const t = this.ctx?.currentTime ?? 0;
      channel.gain.gain.cancelScheduledValues(t);
      channel.gain.gain.setTargetAtTime(0.0001, t, 0.03);
      setTimeout(() => {
        try {
          channel.src.stop();
        } catch {
          // already stopped
        }
      }, 220);
    } catch {
      // ignore audio scheduling errors
    }
    this.emit();
  }

  stopAll(): void {
    for (const type of Array.from(this.channels.keys())) this.stopChannel(type);
    this.emit();
  }

  setVolume(type: NoiseType, value: number): void {
    this.volumes[type] = Math.max(0, Math.min(100, value));
    const channel = this.channels.get(type);
    if (channel && this.ctx) {
      channel.gain.gain.setTargetAtTime(
        (this.volumes[type] / 100) * NOISE_BASE_GAIN[type],
        this.ctx.currentTime,
        0.02,
      );
    }
    this.emit();
  }

  setMaster(value: number): void {
    this.masterVolume = Math.max(0, Math.min(100, value));
    if (this.masterGain && this.ctx && !this.sleepFade) {
      this.masterGain.gain.setTargetAtTime(
        Math.max(0.0001, this.masterVolume / 100),
        this.ctx.currentTime,
        0.02,
      );
    }
    this.emit();
  }

  get master(): number {
    return this.masterVolume;
  }

  get sleepEnd(): number {
    return this.sleepEndMs;
  }

  get sleepMinutes(): number {
    return this.sleepMin;
  }

  setSleep(minutes: number): void {
    if (!minutes) {
      this.cancelSleep();
      return;
    }
    this.sleepMin = minutes;
    this.sleepEndMs = this.now() + minutes * 60_000;
    this.sleepFade = false;
    this.emit();
  }

  cancelSleep(): void {
    this.sleepEndMs = 0;
    this.sleepMin = 0;
    this.sleepFade = false;
    if (this.masterGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setTargetAtTime(
        Math.max(0.0001, this.masterVolume / 100),
        t,
        0.05,
      );
    }
    this.emit();
  }

  /** Drives the sleep timer; call at least once a second while a timer is set. */
  tickSleep(nowMs: number = this.now()): void {
    if (!this.sleepEndMs) return;
    const left = this.sleepEndMs - nowMs;
    if (left <= 0) {
      this.sleepEndMs = 0;
      this.sleepMin = 0;
      this.sleepFade = false;
      this.stopAll();
      if (this.masterGain && this.ctx) {
        const t = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(t);
        this.masterGain.gain.setTargetAtTime(
          Math.max(0.0001, this.masterVolume / 100),
          t,
          0.05,
        );
      }
      this.emit();
      return;
    }
    if (left <= SLEEP_FADE_MS && !this.sleepFade && this.masterGain && this.ctx) {
      this.sleepFade = true;
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), t);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, t + left / 1000);
    }
    this.emit();
  }

  /** Short square-wave chime for timer events; silent without a running context. */
  chime(times = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    for (let i = 0; i < Math.max(1, times); i++) {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        const t = t0 + i * 0.28;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
      } catch {
        return;
      }
    }
  }

  dispose(): void {
    this.stopAll();
    try {
      this.ctx?.close().catch(() => {});
    } catch {
      // ignore
    }
    this.ctx = null;
    this.masterGain = null;
    this.buffers.clear();
    this.listeners.clear();
  }

  private buildSnapshot(): NoiseSnapshot {
    return {
      available: this.available,
      channels: {
        white: this.channels.has('white'),
        pink: this.channels.has('pink'),
        brown: this.channels.has('brown'),
      },
      volumes: { ...this.volumes },
      master: this.masterVolume,
      sleepEndMs: this.sleepEndMs,
      sleepMin: this.sleepMin,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // subscriber errors must not break audio
      }
    }
  }
}

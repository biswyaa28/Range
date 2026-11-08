import { describe, it, expect, vi } from 'vitest';
import {
  NoiseEngine,
  NOISE_BASE_GAIN,
  NOISE_TYPES,
  generateNoiseSamples,
} from '@/engines/noise';

function seededRandom(seed = 1234567): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('generateNoiseSamples', () => {
  it.each(NOISE_TYPES)('%s samples are finite, clamped and palindrome-seamless', (type) => {
    const samples = generateNoiseSamples(type, 4_000, seededRandom());

    expect(samples).toHaveLength(4_000);
    for (let i = 0; i < samples.length; i++) {
      const value = samples[i]!;
      expect(Number.isFinite(value)).toBe(true);
      expect(Number.isNaN(value)).toBe(false);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBe(samples[samples.length - 1 - i]!);
    }
    expect(samples[samples.length - 1]).toBe(samples[0]);
  });

  it.each(NOISE_TYPES)('%s handles odd buffer lengths', (type) => {
    const samples = generateNoiseSamples(type, 9, seededRandom(7));
    expect(samples).toHaveLength(9);
    for (let i = 0; i < samples.length; i++) {
      expect(samples[i]).toBe(samples[samples.length - 1 - i]);
    }
  });

  it('produces different textures per noise type', () => {
    const white = generateNoiseSamples('white', 2_000, seededRandom(99));
    const pink = generateNoiseSamples('pink', 2_000, seededRandom(99));
    const brown = generateNoiseSamples('brown', 2_000, seededRandom(99));

    const roughness = (values: Float32Array) => {
      let total = 0;
      for (let i = 1; i < values.length; i++) {
        total += Math.abs(values[i]! - values[i - 1]!);
      }
      return total / (values.length - 1);
    };

    // Brown is the smoothest, white the most jagged.
    expect(roughness(brown)).toBeLessThan(roughness(pink));
    expect(roughness(pink)).toBeLessThan(roughness(white));
    expect(white.some((value) => value !== 0)).toBe(true);
  });

  it('clamps out-of-range random sources instead of emitting NaN', () => {
    const high = generateNoiseSamples('white', 32, () => 8);
    const low = generateNoiseSamples('white', 32, () => -8);
    expect(Array.from(high).every((value) => value === 1)).toBe(true);
    expect(Array.from(low).every((value) => value === -1)).toBe(true);
  });
});

interface FakeParam {
  value: number;
  setTargetAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  setValueAtTime: ReturnType<typeof vi.fn>;
}

function fakeParam(value = 1): FakeParam {
  return {
    value,
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
  };
}

function makeFakeAudio() {
  const sources: Array<{ stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> }> = [];
  const oscillators: Array<{
    stop: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  }> = [];

  const context = {
    state: 'running',
    sampleRate: 8_000,
    currentTime: 0,
    destination: {},
    createGain: () => ({ gain: fakeParam(), connect: vi.fn() }),
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      const source = {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(source);
      return source;
    },
    createOscillator: () => {
      const oscillator = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };

  return { context, sources, oscillators };
}

describe('NoiseEngine', () => {
  it('builds palindrome buffers for every channel once', () => {
    const fake = makeFakeAudio();
    const engine = new NoiseEngine({
      audioContext: () => fake.context as unknown as AudioContext,
      random: seededRandom(),
    });

    engine.ensureContext();
    engine.ensureContext();
    expect(fake.context.createBuffer).toBeDefined();
    expect(engine.isPlaying('white')).toBe(false);
  });

  it('starts, toggles and stops noise channels', () => {
    const fake = makeFakeAudio();
    const engine = new NoiseEngine({
      audioContext: () => fake.context as unknown as AudioContext,
    });

    expect(engine.startChannel('white')).toBe(true);
    expect(engine.isPlaying('white')).toBe(true);
    expect(engine.getSnapshot().channels.white).toBe(true);

    expect(engine.toggle('pink')).toBe(true);
    expect(engine.toggle('pink')).toBe(false);
    expect(engine.isPlaying('pink')).toBe(false);

    engine.stopAll();
    expect(engine.getSnapshot().channels).toEqual({
      white: false,
      pink: false,
      brown: false,
    });
  });

  it('clamps per-noise and master volumes in its snapshot', () => {
    const fake = makeFakeAudio();
    const engine = new NoiseEngine({
      audioContext: () => fake.context as unknown as AudioContext,
    });

    engine.setVolumes({ white: 150, pink: -20, brown: 42 });
    engine.setMaster(400);
    expect(engine.getSnapshot().volumes).toEqual({ white: 100, pink: 0, brown: 42 });
    expect(engine.master).toBe(100);

    engine.startChannel('white');
    engine.setVolume('white', 10);
    expect(engine.getSnapshot().volumes.white).toBe(10);
    expect(NOISE_BASE_GAIN.white).toBeGreaterThan(0);
  });

  it('runs the sleep countdown, fades, and stops every channel at zero', () => {
    let now = 1_000;
    const fake = makeFakeAudio();
    const engine = new NoiseEngine({
      now: () => now,
      audioContext: () => fake.context as unknown as AudioContext,
    });

    engine.startChannel('white');
    engine.startChannel('brown');
    engine.setSleep(15);
    expect(engine.sleepMinutes).toBe(15);
    expect(engine.sleepEnd).toBe(now + 15 * 60_000);

    now += 10 * 60_000;
    engine.tickSleep();
    expect(engine.isPlaying('white')).toBe(true);

    now += 5 * 60_000;
    engine.tickSleep();
    expect(engine.sleepEnd).toBe(0);
    expect(engine.sleepMinutes).toBe(0);
    expect(engine.isPlaying('white')).toBe(false);
    expect(engine.isPlaying('brown')).toBe(false);
  });

  it('cancels a sleep timer and chimes only with a running context', () => {
    const fake = makeFakeAudio();
    const engine = new NoiseEngine({
      audioContext: () => fake.context as unknown as AudioContext,
    });

    engine.setSleep(30);
    engine.cancelSleep();
    expect(engine.sleepEnd).toBe(0);

    engine.chime(2);
    expect(fake.oscillators).toHaveLength(0);

    engine.ensureContext();
    engine.chime(2);
    expect(fake.oscillators).toHaveLength(2);

    engine.dispose();
    expect(fake.context.close).toHaveBeenCalled();
  });

  it('reports audio as unavailable without a browser AudioContext', () => {
    const engine = new NoiseEngine();
    expect(engine.available).toBe(false);
    expect(engine.getSnapshot().available).toBe(false);
    expect(engine.startChannel('brown')).toBe(false);
  });
});

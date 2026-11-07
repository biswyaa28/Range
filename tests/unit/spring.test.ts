import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spring } from '@/engines/spring';

describe('Spring solver engine', () => {
  let originalRaf: typeof requestAnimationFrame;
  let originalCaf: typeof cancelAnimationFrame;
  let rafCallback: ((time: number) => void) | null = null;
  let rafId = 0;

  beforeEach(() => {
    rafCallback = null;
    rafId = 0;
    originalRaf = global.requestAnimationFrame;
    originalCaf = global.cancelAnimationFrame;

    global.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafId++;
      rafCallback = cb;
      return rafId;
    };

    global.cancelAnimationFrame = () => {
      rafCallback = null;
    };
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRaf;
    global.cancelAnimationFrame = originalCaf;
  });

  it('settles cleanly to the target value without NaN or infinite oscillation', () => {
    const updates: number[] = [];
    let doneCalled = false;

    spring({
      from: 100,
      to: 0,
      stiffness: 260,
      damping: 22,
      mass: 1,
      onUpdate: (x) => {
        expect(Number.isNaN(x)).toBe(false);
        expect(Number.isFinite(x)).toBe(true);
        updates.push(x);
      },
      onDone: () => {
        doneCalled = true;
      },
    });

    let now = 1000;
    for (let i = 0; i < 100; i++) {
      if (doneCalled) break;
      if (rafCallback) {
        now += 16;
        const cb = rafCallback;
        rafCallback = null;
        cb(now);
      }
    }

    expect(updates.length).toBeGreaterThan(0);
    expect(doneCalled).toBe(true);
    const lastValue = updates[updates.length - 1];
    expect(lastValue).toBe(0);
  });

  it('cancels gracefully', () => {
    const updates: number[] = [];
    let doneCalled = false;

    const handle = spring({
      from: 50,
      to: 0,
      onUpdate: (x) => updates.push(x),
      onDone: () => {
        doneCalled = true;
      },
    });

    let now = 1000;
    for (let i = 0; i < 3; i++) {
      if (rafCallback) {
        now += 16;
        const cb = rafCallback;
        rafCallback = null;
        cb(now);
      }
    }

    const countBeforeCancel = updates.length;
    handle.cancel();

    expect(rafCallback).toBeNull();
    expect(updates.length).toBe(countBeforeCancel);
    expect(doneCalled).toBe(false);
  });
});

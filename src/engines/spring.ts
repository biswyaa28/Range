export interface SpringOptions {
  from?: number;
  to?: number;
  velocity?: number;
  stiffness?: number; // k, default 260
  damping?: number;   // c, default 22
  mass?: number;      // m, default 1
  eps?: number;       // default Math.max(0.05, Math.abs(to) * 0.001)
  onUpdate?: (x: number) => void;
  onDone?: () => void;
  // legacy aliases support
  k?: number;
  c?: number;
  m?: number;
  step?: (x: number) => void;
  done?: () => void;
}

export interface SpringHandle {
  cancel: () => void;
}

interface SpringState {
  x: number;
  to: number;
  v: number;
  k: number;
  c: number;
  m: number;
  t: number;
  eps: number;
  step: (x: number) => void;
  done: (() => void) | null;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const live = new Set<SpringState>();
let raf = 0;

function loop(timestamp?: number): void {
  raf = 0;
  const now = typeof timestamp === 'number' && !Number.isNaN(timestamp)
    ? timestamp
    : (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // Make a snapshot of items to iterate to allow deletion during iteration
  const items = Array.from(live);
  for (const s of items) {
    if (!live.has(s)) continue;

    let dt = (now - s.t) / 1000;
    s.t = now;
    if (!(dt > 0) || dt > 0.05) {
      dt = 0.016;
    }

    const F = -s.k * (s.x - s.to) - s.c * s.v;
    s.v += (F / s.m) * dt;
    s.x += s.v * dt;

    if (Math.abs(s.x - s.to) < s.eps && Math.abs(s.v) < 3) {
      s.x = s.to;
      s.step(s.to);
      live.delete(s);
      if (s.done) {
        try {
          s.done();
        } catch {
          // ignore callback error
        }
      }
      continue;
    }

    s.step(s.x);
  }

  if (live.size > 0 && typeof requestAnimationFrame === 'function') {
    raf = requestAnimationFrame(loop);
  }
}

export function spring(options: SpringOptions): SpringHandle {
  const target = options.to ?? 0;
  const kVal = options.stiffness ?? options.k ?? 260;
  const cVal = options.damping ?? options.c ?? 22;
  const mVal = options.mass ?? options.m ?? 1;
  const updateFn = options.onUpdate ?? options.step ?? (() => {});
  const doneFn = options.onDone ?? options.done ?? null;
  const epsVal = options.eps != null ? options.eps : Math.max(0.05, Math.abs(target) * 0.001);

  const s: SpringState = {
    x: options.from ?? 0,
    to: target,
    v: options.velocity ?? 0,
    k: kVal,
    c: cVal,
    m: mVal > 0 ? mVal : 1,
    t: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    eps: epsVal,
    step: updateFn,
    done: doneFn,
  };

  if (prefersReducedMotion()) {
    s.step(s.to);
    if (s.done) {
      try {
        s.done();
      } catch {
        // ignore
      }
    }
    return { cancel: () => {} };
  }

  live.add(s);
  if (!raf && typeof requestAnimationFrame === 'function') {
    raf = requestAnimationFrame(loop);
  }

  return {
    cancel: () => {
      live.delete(s);
      if (live.size === 0 && raf && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}

export const Spring = {
  to: spring,
};


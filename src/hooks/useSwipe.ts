import { useState, useRef, useEffect, useCallback } from 'react';
import { spring } from '@/engines/spring';
import { useReducedMotion } from './useReducedMotion';

export interface SwipeCommitInfo {
  direction: 'right' | 'left';
  distance: number;
  velocity: number;
}

export interface UseSwipeOptions {
  onCommitRight?: () => void;
  onCommitLeft?: () => void;
  onCommit?: (info: SwipeCommitInfo) => void;
  threshold?: number; // fallback minimum commit distance, default 64
  disabled?: boolean;
}

export interface SwipeCommitDecision {
  committed: boolean;
  direction?: 'right' | 'left';
}

/**
 * Pure commit logic function for testing and evaluation.
 */
export function checkSwipeCommit(
  dx: number,
  velocity: number,
  threshold: number = 64,
): SwipeCommitDecision {
  const goRight = dx > threshold || (dx > 14 && velocity > 0.55);
  const goLeft = -dx > threshold || (dx < -14 && velocity < -0.55);

  if (goRight) {
    return { committed: true, direction: 'right' };
  }
  if (goLeft) {
    return { committed: true, direction: 'left' };
  }
  return { committed: false };
}

export function useSwipe<T extends HTMLElement = HTMLDivElement>(options: UseSwipeOptions = {}) {
  const { onCommitRight, onCommitLeft, onCommit, disabled = false } = options;
  const prefersReduced = useReducedMotion();

  const [offset, setOffset] = useState<number>(0);
  const [swiping, setSwiping] = useState<boolean>(false);
  const [engaged, setEngaged] = useState<boolean>(false);

  const elementRef = useRef<T | null>(null);
  const springRef = useRef<{ cancel: () => void } | null>(null);

  const stateRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    currentDx: 0,
    width: 0,
    threshold: 64,
    engaged: false,
    horizontalLock: false,
    verticalCancel: false,
    samples: [] as Array<{ x: number; t: number }>,
  });

  const getVelocity = useCallback(() => {
    const s = stateRef.current.samples;
    if (s.length < 2) return 0;
    const b = s[s.length - 1];
    if (!b) return 0;
    let a = s[0] ?? b;
    for (let i = s.length - 2; i >= 0; i--) {
      const sample = s[i];
      if (sample && b.t - sample.t >= 16) {
        a = sample;
        break;
      }
    }
    const dt = b.t - a.t;
    return dt > 0 ? (b.x - a.x) / dt : 0;
  }, []);

  const snapBack = useCallback(
    (fromX: number, velocity: number) => {
      if (prefersReduced) {
        setOffset(0);
        setSwiping(false);
        setEngaged(false);
        return;
      }

      if (springRef.current) {
        springRef.current.cancel();
      }

      const clampedV = Math.max(-1800, Math.min(1800, (velocity || 0) * 600));

      springRef.current = spring({
        from: fromX,
        to: 0,
        velocity: clampedV,
        stiffness: 300,
        damping: 24,
        onUpdate: (x) => {
          setOffset(x);
        },
        onDone: () => {
          setOffset(0);
          setSwiping(false);
          setEngaged(false);
          springRef.current = null;
        },
      });
    },
    [prefersReduced],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<T>) => {
      if (disabled || prefersReduced) return;
      if (e.button !== undefined && e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (target && target.closest('input, textarea, select, button:not(.task-main), [contenteditable]')) {
        return;
      }

      const el = elementRef.current;
      const w = el ? el.offsetWidth : 300;
      const threshold = Math.max(64, Math.min(120, w * 0.3));

      stateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        currentDx: 0,
        width: w,
        threshold,
        engaged: false,
        horizontalLock: false,
        verticalCancel: false,
        samples: [{ x: e.clientX, t: performance.now() }],
      };

      if (springRef.current) {
        springRef.current.cancel();
        springRef.current = null;
      }
    },
    [disabled, prefersReduced],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      const state = stateRef.current;
      if (state.pointerId !== e.pointerId || state.verticalCancel) return;

      const x = e.clientX;
      const y = e.clientY;
      const t = performance.now();
      const dx = x - state.startX;
      const dy = y - state.startY;

      if (!state.engaged) {
        // Vertical gesture intent - cancel swipe early so native vertical scroll works seamlessly
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          state.verticalCancel = true;
          snapBack(state.currentDx, 0);
          return;
        }

        // Horizontal lock threshold
        if (Math.abs(dx) < 9 || Math.abs(dx) < Math.abs(dy) + 4) {
          return;
        }

        // Lock horizontal intent
        state.engaged = true;
        state.horizontalLock = true;
        setEngaged(true);
        setSwiping(true);

        const el = elementRef.current;
        if (el) {
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }
      }

      state.samples.push({ x, t });
      if (state.samples.length > 12) {
        state.samples.shift();
      }

      // Clamp movement within 92% of row width
      const maxMove = state.width * 0.92;
      const clampedDx = Math.max(-maxMove, Math.min(maxMove, dx));
      state.currentDx = clampedDx;
      setOffset(clampedDx);
    },
    [snapBack],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<T>) => {
      const state = stateRef.current;
      if (state.pointerId !== e.pointerId) return;

      const el = elementRef.current;
      if (el) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }

      state.pointerId = -1;

      if (!state.engaged) {
        return;
      }

      const v = getVelocity();
      const dx = state.currentDx;
      const th = state.threshold;

      const decision = checkSwipeCommit(dx, v, th);

      if (decision.committed && decision.direction === 'right') {
        onCommitRight?.();
        onCommit?.({ direction: 'right', distance: dx, velocity: v });
        snapBack(dx, v);
      } else if (decision.committed && decision.direction === 'left') {
        onCommitLeft?.();
        onCommit?.({ direction: 'left', distance: dx, velocity: v });
        // Handled by caller or snapBack if needed
        setSwiping(false);
        setEngaged(false);
      } else {
        snapBack(dx, v);
      }
    },
    [getVelocity, onCommitRight, onCommitLeft, onCommit, snapBack],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<T>) => {
      const state = stateRef.current;
      if (state.pointerId !== e.pointerId) return;
      state.pointerId = -1;
      if (state.engaged) {
        snapBack(state.currentDx, 0);
      }
    },
    [snapBack],
  );

  useEffect(() => {
    return () => {
      if (springRef.current) {
        springRef.current.cancel();
      }
    };
  }, []);

  return {
    ref: elementRef,
    offset,
    transform: offset !== 0 ? `translateX(${offset.toFixed(1)}px)` : undefined,
    swiping,
    engaged,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    snapBack,
  };
}


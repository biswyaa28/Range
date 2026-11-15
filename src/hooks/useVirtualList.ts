import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

/**
 * Windowed rendering for long lists. Below `threshold` every row renders so
 * small lists keep native find-in-page, tab order and screen-reader output.
 * Above it only the visible slice (plus overscan) exists in the DOM.
 *
 * `rowHeight` is the estimate for unmeasured rows. Pass `measure` to let the
 * hook learn real heights (chat bubbles wrap, fixed rows do not).
 */
export interface VirtualListOptions {
  count: number;
  rowHeight: number;
  threshold?: number;
  overscan?: number;
  /** Scroll container. Omitting it follows the page. */
  scrollRef?: MutableRefObject<HTMLElement | null>;
  measure?: boolean;
}

export interface VirtualListResult {
  virtual: boolean;
  start: number;
  end: number;
  totalHeight: number;
  offsetFor: (index: number) => number;
  measureRow: (index: number, element: HTMLElement | null) => void;
  containerRef: MutableRefObject<HTMLDivElement | null>;
}

const DEFAULT_THRESHOLD = 100;
const DEFAULT_OVERSCAN = 8;

export function useVirtualList({
  count,
  rowHeight,
  threshold = DEFAULT_THRESHOLD,
  overscan = DEFAULT_OVERSCAN,
  scrollRef,
  measure = false,
}: VirtualListOptions): VirtualListResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heights = useRef<number[]>([]);
  const observers = useRef(new Map<number, ResizeObserver>());
  const [version, setVersion] = useState(0);
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 40) });

  const virtual = count >= threshold;

  const offsets = useMemo(() => {
    const out = new Array<number>(count + 1);
    out[0] = 0;
    for (let index = 0; index < count; index += 1) {
      out[index + 1] = out[index]! + (measure ? heights.current[index] || rowHeight : rowHeight);
    }
    return out;
    // `version` changes after a measurement so the prefix sums refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, rowHeight, measure, version]);

  const recompute = useCallback(() => {
    if (!virtual) {
      setRange({ start: 0, end: count });
      return;
    }
    const element = containerRef.current;
    let scrollTop = typeof window === 'undefined' ? 0 : window.scrollY;
    let viewport = typeof window === 'undefined' ? 800 : window.innerHeight;

    if (scrollRef?.current) {
      scrollTop = scrollRef.current.scrollTop;
      viewport = scrollRef.current.clientHeight || viewport;
    } else if (element) {
      const top = element.getBoundingClientRect().top + scrollTop;
      scrollTop = Math.max(0, scrollTop - top);
    }

    const total = offsets[count] || 0;
    const maxStart = Math.max(0, count - 1);
    let start = 0;
    let end = count;
    if (measure) {
      // Binary search the first row whose bottom passes the viewport top.
      let low = 0;
      let high = maxStart;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if ((offsets[mid + 1] ?? 0) < scrollTop) low = mid + 1;
        else high = mid;
      }
      start = low;
      end = count;
      for (let index = start; index < count; index += 1) {
        if ((offsets[index] ?? 0) > scrollTop + viewport) {
          end = index;
          break;
        }
      }
    } else {
      start = Math.floor(scrollTop / rowHeight);
      end = Math.ceil((scrollTop + viewport) / rowHeight);
    }

    start = Math.max(0, start - overscan);
    end = Math.min(count, end + overscan);
    if (total === 0) end = count;
    setRange((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, [count, measure, offsets, overscan, rowHeight, scrollRef, virtual]);

  useEffect(() => {
    if (!virtual) {
      setRange({ start: 0, end: count });
      return;
    }
    const target: HTMLElement | Window =
      scrollRef?.current ?? (typeof window === 'undefined' ? containerRef.current ?? window : window);
    recompute();
    target.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute);
    return () => {
      target.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
    };
  }, [recompute, scrollRef, virtual, count]);

  const measureRow = useCallback(
    (index: number, element: HTMLElement | null) => {
      if (!measure || !virtual || !element) return;
      const height = element.getBoundingClientRect().height;
      if (!height || Math.abs((heights.current[index] || 0) - height) < 0.5) return;
      heights.current[index] = height;
      setVersion((value) => value + 1);
      if (typeof ResizeObserver !== 'undefined') {
        if (!observers.current.has(index)) {
          const observer = new ResizeObserver(() => {
            const next = element.getBoundingClientRect().height;
            if (next && Math.abs((heights.current[index] || 0) - next) >= 0.5) {
              heights.current[index] = next;
              setVersion((value) => value + 1);
            }
          });
          observer.observe(element);
          observers.current.set(index, observer);
        }
      }
    },
    [measure, virtual],
  );

  return {
    virtual,
    start: virtual ? range.start : 0,
    end: virtual ? range.end : count,
    totalHeight: virtual ? Math.max(offsets[count] || 0, count * rowHeight) : 0,
    offsetFor: (index) => (measure ? offsets[index] || 0 : index * rowHeight),
    measureRow,
    containerRef,
  };
}

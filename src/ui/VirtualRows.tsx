import React, { type MutableRefObject } from 'react';
import { useVirtualList } from '@/hooks/useVirtualList';

export interface VirtualRowsProps<T> {
  items: readonly T[];
  rowHeight: number;
  getKey: (item: T, index: number) => string;
  renderRow: (item: T, index: number) => React.ReactNode;
  scrollRef?: MutableRefObject<HTMLElement | null>;
  threshold?: number;
  overscan?: number;
  className?: string;
  testId?: string;
}

/**
 * Renders a long list as a window of measured rows. Below the threshold the
 * rows render normally, so short lists keep their native order and a11y tree.
 */
export function VirtualRows<T>({
  items,
  rowHeight,
  getKey,
  renderRow,
  scrollRef,
  threshold = 100,
  overscan = 8,
  className,
  testId,
}: VirtualRowsProps<T>): React.ReactElement {
  const { virtual, start, end, totalHeight, offsetFor, measureRow, containerRef } =
    useVirtualList({
      count: items.length,
      rowHeight,
      threshold,
      overscan,
      scrollRef,
      measure: true,
    });

  if (!virtual) {
    return (
      <div className={className} data-testid={testId}>
        {items.map((item, index) => (
          <div key={getKey(item, index)}>{renderRow(item, index)}</div>
        ))}
      </div>
    );
  }

  const safeEnd = Math.min(end, items.length);

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid={testId}
      data-virtualized="true"
      style={{ position: 'relative', height: totalHeight, flex: 'none' }}
    >
      {items.slice(start, safeEnd).map((item, offset) => {
        const index = start + offset;
        return (
          <div
            key={getKey(item, index)}
            ref={(element) => measureRow(index, element)}
            data-virtual-index={index}
            style={{
              position: 'absolute',
              top: offsetFor(index),
              left: 0,
              right: 0,
            }}
          >
            {renderRow(item, index)}
          </div>
        );
      })}
    </div>
  );
}

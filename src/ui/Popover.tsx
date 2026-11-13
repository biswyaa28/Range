import React, { useRef, useLayoutEffect, useState } from 'react';
import './Popover.css';

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

export const Popover: React.FC<PopoverProps> = ({
  open,
  onClose,
  anchorEl,
  children,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    openerRef.current = document.activeElement as HTMLElement | null;

    const updatePosition = () => {
      const margin = 8;
      const rect = anchorEl.getBoundingClientRect();
      const popEl = popoverRef.current;
      if (!popEl) return;
      const popRect = popEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const popWidth = Math.min(
        popRect.width || popEl.offsetWidth || 240,
        viewportWidth - margin * 2,
      );
      const popHeight = Math.min(
        popRect.height || popEl.offsetHeight || 180,
        viewportHeight - margin * 2,
      );

      // Work in viewport coordinates first, then translate into the space of
      // the popover's containing block. The header is `position: sticky`, so
      // its popovers are absolute children of a positioned ancestor; adding
      // window.scrollY there pushes them far below the fold once the page has
      // been scrolled.
      let top = rect.bottom + margin;
      const wouldOverflowBottom = rect.bottom + popHeight + margin > viewportHeight;
      const flippedTop = rect.top - popHeight - margin;
      if (wouldOverflowBottom && flippedTop >= margin) {
        top = flippedTop;
      }
      top = Math.max(margin, Math.min(top, viewportHeight - popHeight - margin));

      let left = rect.left;
      if (rect.left + popWidth + margin > viewportWidth) {
        left = viewportWidth - popWidth - margin;
      }
      left = Math.max(margin, Math.min(left, viewportWidth - popWidth - margin));

      const parent = popEl.offsetParent as HTMLElement | null;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        setCoords({
          top: top - parentRect.top - parent.clientTop + parent.scrollTop,
          left: left - parentRect.left - parent.clientLeft + parent.scrollLeft,
        });
      } else {
        setCoords({ top: top + window.scrollY, left: left + window.scrollX });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    const onPointerDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !anchorEl.contains(e.target as Node)
      ) {
        onCloseRef.current();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      if (openerRef.current?.isConnected) {
        openerRef.current.focus({ preventScroll: true });
      }
    };
  }, [open, anchorEl]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      className={`popover ${className}`.trim()}
      role="dialog"
      aria-label={ariaLabel}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        maxHeight: 'calc(100dvh - 16px)',
        overflowY: 'auto',
      }}
    >
      {children}
    </div>
  );
};


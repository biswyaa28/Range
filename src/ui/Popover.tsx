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
      const popRect = popEl?.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const popWidth = Math.min(
        popRect?.width ?? popEl?.offsetWidth ?? 240,
        viewportWidth - margin * 2,
      );
      const popHeight = Math.min(
        popRect?.height ?? popEl?.offsetHeight ?? 180,
        viewportHeight - margin * 2,
      );

      let top = rect.bottom + 8 + scrollY;
      const wouldOverflowBottom = rect.bottom + popHeight + margin > viewportHeight;
      const flippedTop = rect.top - popHeight - 8 + scrollY;
      if (wouldOverflowBottom && flippedTop >= scrollY + margin) {
        top = flippedTop;
      }
      top = Math.max(
        scrollY + margin,
        Math.min(top, scrollY + viewportHeight - popHeight - margin),
      );

      let left = rect.left + scrollX;
      if (rect.left + popWidth + margin > viewportWidth) {
        left = viewportWidth - popWidth - margin + scrollX;
      }
      left = Math.max(
        scrollX + margin,
        Math.min(left, scrollX + viewportWidth - popWidth - margin),
      );

      setCoords({ top, left });
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


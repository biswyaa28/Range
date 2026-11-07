import React, { useRef, useEffect, useState } from 'react';
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
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !anchorEl) return;

    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      const popEl = popoverRef.current;
      const popWidth = popEl ? popEl.offsetWidth : 240;
      const popHeight = popEl ? popEl.offsetHeight : 180;

      let top = rect.bottom + 8 + window.scrollY;
      let left = rect.left + window.scrollX;

      // Flip upward if overflowing viewport bottom
      if (rect.bottom + popHeight > window.innerHeight && rect.top > popHeight) {
        top = rect.top - popHeight - 8 + window.scrollY;
      }

      // Flip leftward if overflowing viewport right
      if (rect.left + popWidth > window.innerWidth) {
        left = window.innerWidth - popWidth - 16 + window.scrollX;
      }
      if (left < 16) left = 16;

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
        onClose();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, anchorEl, onClose]);

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
      }}
    >
      {children}
    </div>
  );
};


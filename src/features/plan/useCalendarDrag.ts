import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Block } from '@/domain/types';
import { hmToMin } from '@/domain/dates';
import {
  columnAtX,
  createDragRange,
  minuteAtY,
  moveRangeTo,
  rangeDuration,
  resizeRangeEnd,
  type ColumnBounds,
  type GridRange,
  type MinuteRange,
} from '@/domain/calendarDrag';

export type CalendarDragKind = 'create' | 'move' | 'resize';

export interface CalendarDragPreview {
  kind: CalendarDragKind;
  blockId: string | null;
  iso: string;
  targetISO: string;
  start: number;
  end: number;
  targetCol: number;
  homeCol: number;
  colDx: number;
}

export interface CalendarDragOptions {
  mode: 'day' | 'week' | 'month';
  blocks: Block[];
  onPickup: () => void;
  onDrop: () => void;
  onCanceled: () => void;
  onCreate: (iso: string, start: number, end: number) => void;
  onMove: (block: Block, range: MinuteRange, targetISO: string) => void;
  onResize: (block: Block, end: number) => void;
}

interface PendingDrag {
  pointerId: number;
  pointerType: string;
  kind: CalendarDragKind;
  canvas: HTMLElement;
  iso: string;
  block: Block | null;
  blockEl: HTMLElement | null;
  captureEl: HTMLElement;
  grid: GridRange;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  anchorMinute: number;
  grabOffset: number;
  duration: number;
  originalStart: number;
  homeCol: number;
  active: boolean;
  holdTimer: number | null;
  touchMove: ((event: TouchEvent) => void) | null;
  contextMenu: ((event: Event) => void) | null;
  nativeMove: ((event: PointerEvent) => void) | null;
  nativeUp: ((event: PointerEvent) => void) | null;
  nativeCancel: ((event: PointerEvent) => void) | null;
  targetISO: string;
  targetCol: number;
  colDx: number;
  range: MinuteRange;
}

function readGrid(canvas: HTMLElement): GridRange {
  return {
    s: Number(canvas.dataset.s ?? 0),
    e: Number(canvas.dataset.e ?? 1440),
  };
}

function readColumns(canvas: HTMLElement): ColumnBounds[] {
  const root = canvas.closest('.cal');
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>('.cal-col[data-iso]')).map(
    (column) => {
      const rect = column.getBoundingClientRect();
      return {
        iso: column.dataset.iso ?? '',
        left: rect.left,
        right: rect.right,
      };
    },
  );
}

function minuteOnCanvas(canvas: HTMLElement, y: number, grid: GridRange): number {
  const rect = canvas.getBoundingClientRect();
  return minuteAtY(y, rect.top, rect.height, grid);
}

export function useCalendarDrag(options: CalendarDragOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const pendingRef = useRef<PendingDrag | null>(null);
  const suppressClickRef = useRef(false);
  const [preview, setPreview] = useState<CalendarDragPreview | null>(null);

  const update = useCallback((pending: PendingDrag, x: number, y: number) => {
    const pointerMinute = minuteOnCanvas(pending.canvas, y, pending.grid);

    if (pending.kind === 'create') {
      pending.range = createDragRange(
        pending.anchorMinute,
        pointerMinute,
        pending.grid,
      );
      pending.targetISO = pending.iso;
      pending.targetCol = pending.homeCol;
      pending.colDx = 0;
    } else if (pending.kind === 'move') {
      pending.range = moveRangeTo(
        pointerMinute - pending.grabOffset,
        pending.duration,
        pending.grid,
      );
      const columns = readColumns(pending.canvas);
      const targetCol = columnAtX(x, columns, pending.homeCol);
      const home = columns[pending.homeCol];
      const target = columns[targetCol];
      pending.targetCol = targetCol;
      pending.targetISO = target?.iso || pending.iso;
      pending.colDx = home && target ? target.left - home.left : 0;
    } else {
      pending.range = resizeRangeEnd(
        pending.originalStart,
        pointerMinute,
        pending.grid,
      );
      pending.targetISO = pending.iso;
      pending.targetCol = pending.homeCol;
      pending.colDx = 0;
    }

    setPreview({
      kind: pending.kind,
      blockId: pending.block?.id ?? null,
      iso: pending.iso,
      targetISO: pending.targetISO,
      start: pending.range.start,
      end: pending.range.end,
      targetCol: pending.targetCol,
      homeCol: pending.homeCol,
      colDx: pending.colDx,
    });
  }, []);

  const activate = useCallback(
    (pending: PendingDrag) => {
      if (pending.active) return;
      pending.active = true;
      if (pending.holdTimer !== null) {
        window.clearTimeout(pending.holdTimer);
        pending.holdTimer = null;
      }

      optionsRef.current.onPickup();
      const columns = readColumns(pending.canvas);
      const homeCol = columns.findIndex((column) => column.iso === pending.iso);
      pending.homeCol = homeCol >= 0 ? homeCol : 0;

      try {
        pending.captureEl.setPointerCapture?.(pending.pointerId);
      } catch {
        // Synthetic events and older browsers may not support capture.
      }

      const preventScroll = (event: TouchEvent) => {
        if (event.cancelable) event.preventDefault();
      };
      pending.touchMove = preventScroll;
      document.addEventListener('touchmove', preventScroll, { passive: false });
      document.body.classList.add('plan-cal-dragging');

      update(pending, pending.lastX, pending.lastY);
    },
    [update],
  );

  const detach = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;

    if (pending.holdTimer !== null) {
      window.clearTimeout(pending.holdTimer);
      pending.holdTimer = null;
    }
    if (pending.nativeMove) {
      document.removeEventListener('pointermove', pending.nativeMove);
    }
    if (pending.nativeUp) {
      document.removeEventListener('pointerup', pending.nativeUp);
    }
    if (pending.nativeCancel) {
      document.removeEventListener('pointercancel', pending.nativeCancel);
    }
    if (pending.touchMove) {
      document.removeEventListener('touchmove', pending.touchMove);
      pending.touchMove = null;
    }
    if (pending.contextMenu) {
      document.removeEventListener('contextmenu', pending.contextMenu);
      pending.contextMenu = null;
    }
    try {
      if (pending.captureEl.hasPointerCapture?.(pending.pointerId)) {
        pending.captureEl.releasePointerCapture(pending.pointerId);
      }
    } catch {
      // Capture may already be gone.
    }

    document.body.classList.remove('plan-cal-dragging');
    pendingRef.current = null;
  }, []);

  const finish = useCallback(
    (commit: boolean) => {
      const pending = pendingRef.current;
      if (!pending) return;
      const wasActive = pending.active;

      if (wasActive) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 60);
      }

      if (commit && wasActive) {
        optionsRef.current.onDrop();
        if (pending.kind === 'create') {
          optionsRef.current.onCreate(
            pending.iso,
            pending.range.start,
            pending.range.end,
          );
        } else if (pending.kind === 'move' && pending.block) {
          optionsRef.current.onMove(
            pending.block,
            { start: pending.range.start, end: pending.range.end },
            pending.targetISO,
          );
        } else if (pending.kind === 'resize' && pending.block) {
          optionsRef.current.onResize(pending.block, pending.range.end);
        }
      } else if (!commit && wasActive) {
        optionsRef.current.onCanceled();
      }

      detach();
      setPreview(null);
    },
    [detach],
  );

  const cancel = useCallback(() => finish(false), [finish]);

  const handleMove = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;

      pending.lastX = event.clientX;
      pending.lastY = event.clientY;

      if (!pending.active) {
        const distance = Math.hypot(
          event.clientX - pending.startX,
          event.clientY - pending.startY,
        );
        if (pending.pointerType === 'touch') {
          if (distance > 10) {
            detach();
            setPreview(null);
          }
          return;
        }
        if (distance < 4) return;
        activate(pending);
      }

      update(pending, event.clientX, event.clientY);
    },
    [activate, detach, update],
  );

  const handleUp = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;
      finish(true);
    },
    [finish],
  );

  const handleCancel = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;
      cancel();
    },
    [cancel],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = optionsRef.current;
      if (current.mode === 'month' || pendingRef.current) return;
      if (!event.isPrimary) return;
      if (event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      const canvas = target?.closest<HTMLElement>('.cal-canvas');
      if (!canvas || !target) return;

      const blockEl = target.closest<HTMLElement>('.cal-blk');
      const block = blockEl
        ? current.blocks.find(
            (item) => item.id === blockEl.dataset.id && !item.deleted,
          ) ?? null
        : null;
      if (blockEl && !block) return;

      const iso = canvas.dataset.iso ?? '';
      if (!iso) return;

      const grid = readGrid(canvas);
      const startMinute = minuteOnCanvas(canvas, event.clientY, grid);
      const nearBottom = blockEl
        ? blockEl.getBoundingClientRect().bottom - event.clientY < 12
        : false;
      const kind: CalendarDragKind = blockEl
        ? nearBottom
          ? 'resize'
          : 'move'
        : 'create';

      const blockStart = block ? hmToMin(block.start) : 0;
      const blockEndRaw = block ? hmToMin(block.end) : 0;
      const blockEnd =
        block && blockEndRaw > blockStart ? blockEndRaw : blockStart + 30;
      const duration = block ? rangeDuration(blockStart, blockEnd) : 0;
      const columns = readColumns(canvas);
      const homeCol = Math.max(
        0,
        columns.findIndex((column) => column.iso === iso),
      );

      const pending: PendingDrag = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        kind,
        canvas,
        iso,
        block,
        blockEl,
        captureEl: blockEl ?? canvas,
        grid,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        anchorMinute: startMinute,
        grabOffset: startMinute - blockStart,
        duration,
        originalStart: blockStart,
        homeCol,
        active: false,
        holdTimer: null,
        touchMove: null,
        contextMenu: null,
        nativeMove: handleMove,
        nativeUp: handleUp,
        nativeCancel: handleCancel,
        targetISO: iso,
        targetCol: homeCol,
        colDx: 0,
        range:
          kind === 'create'
            ? createDragRange(startMinute, startMinute, grid)
            : kind === 'move'
              ? moveRangeTo(blockStart, duration, grid)
              : { start: blockStart, end: blockEnd },
      };

      pendingRef.current = pending;
      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleCancel);

      const preventMenu = (menuEvent: Event) => menuEvent.preventDefault();
      pending.contextMenu = preventMenu;
      document.addEventListener('contextmenu', preventMenu);

      if (event.pointerType === 'touch') {
        pending.holdTimer = window.setTimeout(() => {
          if (pendingRef.current === pending && !pending.active) {
            activate(pending);
          }
        }, 300);
      }
    },
    [activate, handleCancel, handleMove, handleUp],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !pendingRef.current) return;
      event.preventDefault();
      cancel();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [cancel]);

  useEffect(
    () => () => {
      detach();
    },
    [detach],
  );

  return {
    preview,
    onPointerDown,
    isClickSuppressed: () => suppressClickRef.current,
  };
}

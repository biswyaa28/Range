import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Block, Profile } from '@/domain/types';
import {
  DAY_SHORT,
  addDays,
  fmtHM,
  fmtNice,
  fmtShort,
  fromISO,
  hmToMin,
  monthGridStart,
  toISO,
  todayISO,
  weekDayIsos,
  weekDayLabels,
} from '@/domain/dates';
import {
  blocksForDate,
  blockDoneOn,
  calItemsForDate,
  calLayout,
  toggleBlockDoneOnDate,
} from '@/domain/recurrence';
import {
  dragGhostLabel,
  moveBlockDay,
  moveRangeTo,
  resizeRangeEnd,
} from '@/domain/calendarDrag';
import { recomputeDayStats } from '@/domain/stats';
import {
  store,
  softDeleteRecord,
  softUndeleteRecord,
  touchRecord,
  useSettings,
  useStore,
} from '@/store';
import { Icon } from '@/ui/Icon';
import { Popover } from '@/ui/Popover';
import { Segmented } from '@/ui/Segmented';
import { useToast } from '@/ui/Toast';
import { useMediaQuery, useReducedMotion } from '@/hooks';
import { Haptics } from '@/engines/haptics';
import { BlockModal } from './BlockModal';
import { ImportTimetableModal } from './ImportTimetableModal';
import { blockCategoryMeta } from './blockCategories';
import { useCalendarDrag } from './useCalendarDrag';
import './CalendarView.css';

export type CalendarMode = 'day' | 'week' | 'month';

const CAL_HH = 56;

const CAL_BEST: Record<string, readonly [number, number]> = {
  Morning: [360, 720],
  Afternoon: [720, 1020],
  Evening: [1020, 1320],
  'Late night': [1320, 1560],
};

interface GridBound {
  s: number;
  e: number;
}

interface PopoverState {
  blockId: string;
  iso: string;
  anchor: HTMLElement;
}

interface ModalState {
  block: Block | null;
  defaultDay: number | string;
  defaultStart?: string;
  defaultEnd?: string;
  defaultRepeat?: 'once' | 'weekly';
}

function monthShift(iso: string, delta: number): string {
  const date = fromISO(iso);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + delta);
  const max = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, max));
  return toISO(date);
}

function dayWindow(profile: Profile): GridBound {
  const start = hmToMin(profile.wake || '07:00');
  let end = hmToMin(profile.sleep || '23:00');
  if (end <= start) end += 1440;
  return { s: start, e: end };
}

function computeGrid(
  dates: string[],
  allHours: boolean,
  profile: Profile,
  blocks: Block[],
): GridBound {
  if (allHours) return { s: 0, e: 1440 };
  const win = dayWindow(profile);
  let start = win.s;
  let end = win.e;
  dates.forEach((iso) => {
    blocksForDate(blocks, iso).forEach((block) => {
      start = Math.min(start, hmToMin(block.start));
      end = Math.max(end, hmToMin(block.end));
    });
  });
  start = Math.floor(start / 60) * 60;
  end = Math.ceil(end / 60) * 60;
  if (end - start < 120) end = start + 120;
  return { s: start, e: end };
}

function focusRects(bestTime: string, grid: GridBound): GridBound[] {
  const best = CAL_BEST[bestTime];
  if (!best) return [];
  const [bestStart, bestEnd] = best;
  const ranges: GridBound[] = [
    { s: bestStart, e: bestEnd },
    { s: bestStart - 1440, e: bestEnd - 1440 },
    { s: bestStart + 1440, e: bestEnd + 1440 },
  ];
  return ranges
    .map((range) => ({
      s: Math.max(range.s, grid.s),
      e: Math.min(range.e, grid.e),
    }))
    .filter((range) => range.e - range.s >= 30);
}

function calendarTitle(
  mode: CalendarMode,
  anchor: string,
  weekStart: number,
): string {
  const date = fromISO(anchor);
  if (mode === 'month') {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  if (mode === 'day') {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }
  const dates = weekDayIsos(anchor, weekStart);
  const first = dates[0];
  const last = dates[6];
  if (!first || !last) return '';
  return (
    fromISO(first).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' – ' +
    fromISO(last).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  );
}

function hourMarks(grid: GridBound): number[] {
  const marks: number[] = [];
  for (let minute = grid.s; minute <= grid.e; minute += 60) {
    marks.push(minute);
  }
  return marks;
}

function minuteOfNow(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export const CalendarView: React.FC = () => {
  const blocks = useStore((state) => state.blocks);
  const settings = useSettings();
  const profile = useStore((state) => state.profile);
  const deadlines = useStore((state) => state.deadlines);
  const toast = useToast();
  const prefersReduced = useReducedMotion();
  const isMobile = useMediaQuery('(max-width: 699px)');

  const [mode, setMode] = useState<CalendarMode>('week');
  const [anchor, setAnchor] = useState<string>(() => todayISO());
  const [allHours, setAllHours] = useState(false);
  const [direction, setDirection] = useState<'' | 'l' | 'r'>('');
  const [tick, setTick] = useState(0);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [nowMin, setNowMin] = useState(minuteOfNow);
  const [announcement, setAnnouncement] = useState('');

  const colsRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<string | null>(null);

  const today = todayISO();
  const dates = useMemo(
    () => (mode === 'day' ? [anchor] : weekDayIsos(anchor, settings.weekStart)),
    [mode, anchor, settings.weekStart],
  );
  const grid = useMemo(
    () => computeGrid(dates, allHours, profile, blocks),
    [dates, allHours, profile, blocks],
  );
  const canvasHeight = ((grid.e - grid.s) / 60) * CAL_HH;
  const focus = useMemo(() => focusRects(profile.bestTime, grid), [profile.bestTime, grid]);
  const anyBlocks = blocks.some((block) => !block.deleted);
  const liveDeadlines = useMemo(
    () => deadlines.filter((deadline) => !deadline.deleted && deadline.status !== 'done'),
    [deadlines],
  );

  const monthCells = useMemo(() => {
    const start = monthGridStart(anchor, settings.weekStart);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [anchor, settings.weekStart]);

  const closePopover = useCallback(() => setPopover(null), []);

  const goToday = useCallback(() => {
    setDirection('');
    setTick((value) => value + 1);
    setAnchor(todayISO());
    setPopover(null);
  }, []);

  const switchView = useCallback((next: CalendarMode) => {
    setMode(next);
    setDirection('');
    setTick((value) => value + 1);
    setPopover(null);
  }, []);

  const navigatePeriod = useCallback(
    (delta: number) => {
      setDirection(delta < 0 ? 'l' : 'r');
      setTick((value) => value + 1);
      setAnchor((current) => {
        if (mode === 'day') return addDays(current, delta);
        if (mode === 'week') return addDays(current, delta * 7);
        return monthShift(current, delta);
      });
      setPopover(null);
    },
    [mode],
  );

  const openDay = useCallback((iso: string) => {
    setMode('day');
    setAnchor(iso);
    setDirection('');
    setTick((value) => value + 1);
    setPopover(null);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMin(minuteOfNow()), 20000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (modal || importOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && target.isContentEditable) return;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === '[') {
        event.preventDefault();
        navigatePeriod(-1);
      } else if (key === ']') {
        event.preventDefault();
        navigatePeriod(1);
      } else if (key === 'd') {
        event.preventDefault();
        switchView('day');
      } else if (key === 'w') {
        event.preventDefault();
        switchView('week');
      } else if (key === 'm') {
        event.preventDefault();
        switchView('month');
      } else if (key === 't') {
        event.preventDefault();
        goToday();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modal, importOpen, navigatePeriod, switchView, goToday]);

  useEffect(() => {
    if (mode !== 'week' || !isMobile) return;
    const container = colsRef.current;
    if (!container) return;
    const target =
      container.querySelector<HTMLElement>('.cal-col.today') ??
      container.querySelector<HTMLElement>('.cal-col');
    if (!target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const left =
      container.scrollLeft +
      (targetRect.left - containerRect.left) -
      (container.clientWidth - targetRect.width) / 2;
    const nextLeft = Math.max(0, left);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({
        left: nextLeft,
        behavior: prefersReduced ? 'auto' : 'smooth',
      });
    } else {
      container.scrollLeft = nextLeft;
    }
  }, [mode, anchor, prefersReduced, isMobile]);

  const openEditor = useCallback((block: Block) => {
    setModal({ block, defaultDay: block.day });
    setPopover(null);
  }, []);

  const openNewBlock = useCallback(() => {
    setModal({ block: null, defaultDay: mode === 'month' ? todayISO() : anchor });
  }, [mode, anchor]);

  // Palette create/open results and keyboard chord actions.
  useEffect(() => {
    const onEditBlock = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id) return;
      const block = store.get().blocks.find((item) => item.id === id && !item.deleted);
      if (block) openEditor(block);
    };
    const onNewBlock = () => openNewBlock();
    window.addEventListener('personalos:edit-block', onEditBlock);
    window.addEventListener('personalos:new-block', onNewBlock);
    return () => {
      window.removeEventListener('personalos:edit-block', onEditBlock);
      window.removeEventListener('personalos:new-block', onNewBlock);
    };
  }, [openEditor, openNewBlock]);

  const toggleDone = useCallback(
    (block: Block, iso: string) => {
      const wasDone = blockDoneOn(block, iso);
      store.set((state) => {
        const current = state.blocks.find((item) => item.id === block.id);
        if (!current) return;
        toggleBlockDoneOnDate(current, iso);
        touchRecord(current);
        recomputeDayStats(state.dayStats, state.blocks, todayISO());
      });
      closePopover();
      if (wasDone) Haptics.tap();
      else Haptics.success();
    },
    [closePopover],
  );

  const deleteBlock = useCallback(
    (block: Block) => {
      const removed = softDeleteRecord(store.get().blocks, block.id);
      store.set((state) => {
        recomputeDayStats(state.dayStats, state.blocks, todayISO());
      });
      closePopover();
      setAnnouncement('Block deleted');
      Haptics.warning();
      toast.showToast('Block deleted', 'Undo', () => {
        softUndeleteRecord(removed);
        store.set((state) => {
          recomputeDayStats(state.dayStats, state.blocks, todayISO());
        });
      });
    },
    [closePopover, toast],
  );

  const commitMove = useCallback(
    (
      block: Block,
      range: { start: number; end: number },
      targetISO: string,
    ) => {
      const previousDay = block.day;
      const nextDay = moveBlockDay(previousDay, targetISO);
      const nextStart = fmtHM(range.start);
      const nextEnd = fmtHM(range.end);
      if (
        block.start === nextStart &&
        block.end === nextEnd &&
        String(previousDay) === String(nextDay)
      ) {
        return;
      }

      store.set((state) => {
        const current = state.blocks.find((item) => item.id === block.id);
        if (!current) return;
        current.start = nextStart;
        current.end = nextEnd;
        current.day = nextDay;
        touchRecord(current);
        recomputeDayStats(state.dayStats, state.blocks, todayISO());
      });

      const dayChanged = String(previousDay) !== String(nextDay);
      setAnnouncement(
        `${block.title} moved to ${nextStart} to ${nextEnd}` +
          (dayChanged ? ` on ${fmtShort(targetISO)}` : ''),
      );
      pendingFocusRef.current = block.id;
    },
    [],
  );

  const commitResize = useCallback((block: Block, endMinute: number) => {
    const nextEnd = fmtHM(endMinute);
    if (block.end === nextEnd) return;

    store.set((state) => {
      const current = state.blocks.find((item) => item.id === block.id);
      if (!current) return;
      current.end = nextEnd;
      touchRecord(current);
      recomputeDayStats(state.dayStats, state.blocks, todayISO());
    });

    setAnnouncement(
      `${block.title} resized to ${fmtHM(hmToMin(block.start))} to ${nextEnd}`,
    );
    pendingFocusRef.current = block.id;
  }, []);

  const openDragCreate = useCallback(
    (iso: string, start: number, end: number) => {
      setModal({
        block: null,
        defaultDay: iso,
        defaultStart: fmtHM(start),
        defaultEnd: fmtHM(end),
        defaultRepeat: 'once',
      });
    },
    [],
  );

  const {
    preview: drag,
    onPointerDown: onDragPointerDown,
    isClickSuppressed,
  } = useCalendarDrag({
    mode,
    blocks,
    onPickup: () => Haptics.select(),
    onDrop: () => Haptics.tap(),
    onCanceled: () => Haptics.warning(),
    onCreate: openDragCreate,
    onMove: commitMove,
    onResize: commitResize,
  });

  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    pendingFocusRef.current = null;
    const root = colsRef.current;
    if (!root) return;
    const target = Array.from(
      root.querySelectorAll<HTMLElement>('.cal-blk'),
    ).find((element) => element.dataset.id === id);
    if (!target) return;
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  });

  const handleBlockKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, block: Block, iso: string) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const start = hmToMin(block.start);
      const rawEnd = hmToMin(block.end);
      const end = rawEnd > start ? rawEnd : start + 30;
      const duration = end - start;

      if (event.key === 'Enter') {
        event.preventDefault();
        openEditor(block);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteBlock(block);
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const delta = event.key === 'ArrowUp' ? -15 : 15;
        if (event.shiftKey) {
          const next = resizeRangeEnd(start, end + delta, grid);
          if (next.end !== end) commitResize(block, next.end);
        } else {
          const next = moveRangeTo(start + delta, duration, grid);
          if (next.start !== start) commitMove(block, next, iso);
        }
        return;
      }
      if (
        mode === 'week' &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      ) {
        event.preventDefault();
        const targetISO = addDays(iso, event.key === 'ArrowLeft' ? -1 : 1);
        commitMove(block, { start, end: start + duration }, targetISO);
      }
    },
    [commitMove, commitResize, deleteBlock, grid, mode, openEditor],
  );

  const activePopoverBlock =
    popover && blocks.find((block) => block.id === popover.blockId && !block.deleted);

  const renderDayHeader = (iso: string) => {
    const date = fromISO(iso);
    const count = blocksForDate(blocks, iso).length;
    return (
      <>
        <span className="wd">{DAY_SHORT[(date.getDay() + 6) % 7]}</span>
        <span className="dn">{date.getDate()}</span>
        <span className="cnt">{count}</span>
      </>
    );
  };

  const renderGrid = () => (
    <div className={`cal${mode === 'day' ? ' cal-single' : ''}`} data-mode={mode}>
      {mode === 'week' ? (
        <div className="cal-hrow">
          <i className="cal-corner" />
          {dates.map((iso) => (
            <div
              key={iso}
              className={`cal-day-h${iso === today ? ' today' : ''}`}
            >
              {renderDayHeader(iso)}
            </div>
          ))}
        </div>
      ) : null}
      <div className="cal-body">
        <div className="cal-gutter" aria-hidden="true">
          {hourMarks(grid).map((minute) => (
            <i
              key={minute}
              style={{ top: `${((minute - grid.s) / 60) * CAL_HH}px` }}
            >
              {fmtHM(minute)}
            </i>
          ))}
        </div>
        <div
          className="cal-cols"
          ref={colsRef}
          tabIndex={0}
          role="region"
          aria-label="Calendar days"
        >
          {dates.map((iso) => {
            const items = calItemsForDate(blocks, iso, grid);
            const layout = calLayout(items);
            return (
              <div
                key={iso}
                className={`cal-col${iso === today ? ' today' : ''}${
                  drag?.kind === 'move' &&
                  drag.targetISO === iso &&
                  drag.targetCol !== drag.homeCol
                    ? ' drop'
                    : ''
                }`}
                data-iso={iso}
              >
                <div
                  className={`cal-col-h${iso === today ? ' today' : ''}`}
                >
                  {renderDayHeader(iso)}
                </div>
                <div
                  className={`cal-canvas${
                    drag?.kind === 'create' && drag.iso === iso ? ' creating' : ''
                  }`}
                  data-iso={iso}
                  data-s={grid.s}
                  data-e={grid.e}
                  style={{ height: `${canvasHeight}px` }}
                  onPointerDown={onDragPointerDown}
                >
                  <div className="cal-hl" aria-hidden="true" />
                  {focus.map((range, index) => {
                    const height = ((range.e - range.s) / 60) * CAL_HH;
                    return (
                      <div
                        key={index}
                        className={`cal-focus${height > 54 ? ' tall' : ''}`}
                        style={{
                          top: `${((range.s - grid.s) / 60) * CAL_HH}px`,
                          height: `${height}px`,
                        }}
                      >
                        <b>Your focus window</b>
                      </div>
                    );
                  })}
                  {!anyBlocks && iso === dates[0] ? (
                    <div className="cal-hint">
                      Nothing scheduled here yet —
                      <br />
                      use Add block or Import timetable.
                    </div>
                  ) : null}
                  {iso === today && nowMin >= grid.s && nowMin < grid.e ? (
                    <div
                      className="cal-now vis"
                      aria-hidden="true"
                      style={{
                        transform: `translateY(${((nowMin - grid.s) / 60) * CAL_HH}px)`,
                      }}
                    >
                      <b>{fmtHM(nowMin)}</b>
                    </div>
                  ) : null}
                  {drag?.kind === 'create' && drag.iso === iso ? (
                    <div
                      className="cal-ghost"
                      style={{
                        top: `${((drag.start - grid.s) / 60) * CAL_HH}px`,
                        height: `${((drag.end - drag.start) / 60) * CAL_HH}px`,
                      }}
                    >
                      <b>{dragGhostLabel({ start: drag.start, end: drag.end })}</b>
                    </div>
                  ) : null}
                  {layout.map(({ it, col, cols }) => {
                    const block = it.b;
                    const done = blockDoneOn(block, iso);
                    const source = block.source === 'personal' ? 'personal' : 'college';
                    const meta = blockCategoryMeta(String(block.category || 'other'));
                    const height = ((it.e - it.s) / 60) * CAL_HH;
                    const dragging =
                      drag && drag.kind !== 'create' && drag.blockId === block.id
                        ? drag
                        : null;
                    const previewStart = dragging ? dragging.start : it.s;
                    const previewEnd = dragging ? dragging.end : it.e;
                    const previewHeight = ((previewEnd - previewStart) / 60) * CAL_HH;
                    const displayHeight =
                      dragging?.kind === 'resize'
                        ? ((dragging.end - it.s) / 60) * CAL_HH
                        : height;
                    const density =
                      previewHeight < 38 ? ' sm' : previewHeight < 50 ? ' md' : '';
                    const moveDelta =
                      dragging?.kind === 'move'
                        ? {
                            x: dragging.colDx,
                            y: ((dragging.start - it.s) / 60) * CAL_HH,
                          }
                        : null;
                    const ariaLabel =
                      `${block.title}, ${fmtHM(previewStart)} to ${fmtHM(previewEnd)}, ${source}` +
                      (done ? ', done' : '');
                    return (
                      <button
                        key={`${block.id}-${iso}`}
                        type="button"
                        data-id={block.id}
                        data-iso={iso}
                        className={`cal-blk${density}${done ? ' done' : ''}${
                          typeof block.day === 'string' ? ' off' : ''
                        }${dragging ? ' dragging' : ''}`}
                        style={{
                          top: `${((it.s - grid.s) / 60) * CAL_HH}px`,
                          height: `${Math.max(0, displayHeight - 2)}px`,
                          left: `calc(${((col * 100) / cols).toFixed(2)}% + 1px)`,
                          width: `calc(${(100 / cols).toFixed(2)}% - 2px)`,
                          transform: moveDelta
                            ? `translate(${moveDelta.x}px, ${moveDelta.y}px)`
                            : undefined,
                        }}
                        aria-label={ariaLabel}
                        aria-haspopup="dialog"
                        onClick={(event) => {
                          if (isClickSuppressed()) return;
                          setPopover({
                            blockId: block.id,
                            iso,
                            anchor: event.currentTarget,
                          });
                        }}
                        onKeyDown={(event) => handleBlockKeyDown(event, block, iso)}
                      >
                        <span className="cb-t">
                          <Icon name={meta.icon} size={11} />
                          {done ? (
                            <Icon name="check" size={11} className="cal-done-mark" />
                          ) : null}
                          <span className="cb-time">
                            {fmtHM(previewStart)}–{fmtHM(previewEnd)}
                          </span>
                        </span>
                        <span className="cb-title">{block.title}</span>
                        <span className="cb-src">
                          {source === 'personal' ? 'Personal' : 'College'}
                        </span>
                        <span className="rzg" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderMonth = () => (
    <div className="plan-month">
      <div className="cal-mwd">
        {weekDayLabels(settings.weekStart).map((day, index) => (
          <b key={`${day}-${index}`}>{day}</b>
        ))}
      </div>
      <div className="cal-month">
        {monthCells.map((iso) => {
          const date = fromISO(iso);
          const blockCount = blocksForDate(blocks, iso).length;
          const deadlineCount = liveDeadlines.filter(
            (deadline) => deadline.due === iso,
          ).length;
          const inMonth = date.getMonth() === fromISO(anchor).getMonth();
          return (
            <button
              key={iso}
              type="button"
              className={`cal-mcell${inMonth ? '' : ' out'}${
                iso === today ? ' today' : ''
              }`}
              aria-label={`${fmtNice(iso)}, ${blockCount} block${
                blockCount === 1 ? '' : 's'
              }${deadlineCount ? `, ${deadlineCount} deadline${
                deadlineCount === 1 ? '' : 's'
              }` : ''}`}
              onClick={() => openDay(iso)}
            >
              <span className="cmd">{date.getDate()}</span>
              {blockCount ? (
                <span className="cal-mdots" aria-hidden="true">
                  {Array.from({ length: Math.min(blockCount, 3) }, (_, index) => (
                    <i key={index} />
                  ))}
                  {blockCount > 3 ? <em>+{blockCount - 3}</em> : null}
                </span>
              ) : null}
              {deadlineCount ? (
                <span className="cal-mdl" aria-hidden="true">
                  <Icon name="flag" size={9} />
                  {deadlineCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  const popoverDone = activePopoverBlock && popover
    ? blockDoneOn(activePopoverBlock, popover.iso)
    : false;
  const popoverMeta = activePopoverBlock
    ? blockCategoryMeta(String(activePopoverBlock.category || 'other'))
    : null;

  return (
    <div className="plan-cal">
      <div className="view-head">
        <h1>Calendar</h1>
        <div className="rule" />
        <p className="hint">
          Drag the empty grid to add a block, drag a block to move it, or drag its bottom
          edge to resize.
        </p>
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <div className="cal-bar">
        <Segmented<CalendarMode>
          value={mode}
          onChange={switchView}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          aria-label="Calendar view"
        />
        <span className="cnav">
          <button
            type="button"
            className="ibtn"
            aria-label="Previous period"
            onClick={() => navigatePeriod(-1)}
          >
            <Icon name="chevL" size={15} />
          </button>
          <button type="button" className="btn sm ghost" onClick={goToday}>
            Today
          </button>
          <button
            type="button"
            className="ibtn"
            aria-label="Next period"
            onClick={() => navigatePeriod(1)}
          >
            <Icon name="chevR" size={15} />
          </button>
        </span>
        <h2
          key={tick}
          className={`cal-date${direction === 'l' ? ' anim-l' : direction === 'r' ? ' anim-r' : ''}`}
        >
          {calendarTitle(mode, anchor, settings.weekStart)}
        </h2>
        <span className="spacer" />
        <button
          type="button"
          className="btn sm ghost"
          aria-pressed={allHours}
          onClick={() => setAllHours((value) => !value)}
        >
          {allHours ? 'Wake–sleep hours' : 'Show all hours'}
        </button>
        <button type="button" className="btn green" onClick={openNewBlock}>
          <Icon name="plus" size={16} />
          Add block
        </button>
        <button
          type="button"
          className="btn blue"
          onClick={() => setImportOpen(true)}
        >
          <Icon name="download" size={16} />
          Import timetable
        </button>
      </div>

      <div className="cal-card">{mode === 'month' ? renderMonth() : renderGrid()}</div>

      <Popover
        open={Boolean(popover && activePopoverBlock)}
        onClose={closePopover}
        anchorEl={popover?.anchor ?? null}
        className="plan-popover"
        aria-label="Block actions"
      >
        {activePopoverBlock && popover ? (
          <div className="plan-pop">
            <h3>{activePopoverBlock.title}</h3>
            <p className="plan-pop-sub">
              {fmtShort(popover.iso)} · {fmtHM(hmToMin(activePopoverBlock.start))}–
              {fmtHM(hmToMin(activePopoverBlock.end))} · {popoverMeta?.label} ·{' '}
              {activePopoverBlock.source === 'personal' ? 'Personal' : 'College'}
            </p>
            <div className="plan-pop-actions">
              <button
                type="button"
                className={`btn sm${popoverDone ? '' : ' green'}`}
                onClick={() => toggleDone(activePopoverBlock, popover.iso)}
              >
                <Icon name="check" size={14} />
                {popoverDone ? 'Mark not done' : 'Mark done'}
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => openEditor(activePopoverBlock)}
              >
                <Icon name="note" size={14} />
                Edit
              </button>
              <button
                type="button"
                className="btn sm pink"
                onClick={() => deleteBlock(activePopoverBlock)}
              >
                <Icon name="trash" size={14} />
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </Popover>

      <BlockModal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        block={modal?.block ?? null}
        defaultDay={modal?.defaultDay ?? today}
        defaultStart={modal?.defaultStart}
        defaultEnd={modal?.defaultEnd}
        defaultRepeat={modal?.defaultRepeat}
      />

      <ImportTimetableModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
};

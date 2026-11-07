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
  mondayIndex,
  toISO,
  todayISO,
} from '@/domain/dates';
import {
  blocksForDate,
  blockDoneOn,
  calItemsForDate,
  calLayout,
  toggleBlockDoneOnDate,
} from '@/domain/recurrence';
import { recomputeDayStats } from '@/domain/stats';
import {
  store,
  softDeleteRecord,
  softUndeleteRecord,
  touchRecord,
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

function weekDates(iso: string): string[] {
  const monday = addDays(iso, -mondayIndex(fromISO(iso)));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
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

function calendarTitle(mode: CalendarMode, anchor: string): string {
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
  const dates = weekDates(anchor);
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

  const colsRef = useRef<HTMLDivElement | null>(null);

  const today = todayISO();
  const dates = useMemo(
    () => (mode === 'day' ? [anchor] : weekDates(anchor)),
    [mode, anchor],
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
    const date = fromISO(anchor);
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = addDays(toISO(first), -mondayIndex(first));
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [anchor]);

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

  const activePopoverBlock =
    popover && blocks.find((block) => block.id === popover.blockId && !block.deleted);

  const renderDayHeader = (iso: string) => {
    const date = fromISO(iso);
    const count = blocksForDate(blocks, iso).length;
    return (
      <>
        <span className="wd">{DAY_SHORT[mondayIndex(date)]}</span>
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
        <div className="cal-cols" ref={colsRef}>
          {dates.map((iso) => {
            const items = calItemsForDate(blocks, iso, grid);
            const layout = calLayout(items);
            return (
              <div
                key={iso}
                className={`cal-col${iso === today ? ' today' : ''}`}
                data-iso={iso}
              >
                <div
                  className={`cal-col-h${iso === today ? ' today' : ''}`}
                >
                  {renderDayHeader(iso)}
                </div>
                <div
                  className="cal-canvas"
                  data-iso={iso}
                  data-s={grid.s}
                  data-e={grid.e}
                  style={{ height: `${canvasHeight}px` }}
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
                  {layout.map(({ it, col, cols }) => {
                    const block = it.b;
                    const done = blockDoneOn(block, iso);
                    const source = block.source === 'personal' ? 'personal' : 'college';
                    const meta = blockCategoryMeta(String(block.category || 'other'));
                    const height = ((it.e - it.s) / 60) * CAL_HH;
                    const density = height < 38 ? ' sm' : height < 50 ? ' md' : '';
                    const ariaLabel =
                      `${block.title}, ${fmtHM(it.s)} to ${fmtHM(it.e)}, ${source}` +
                      (done ? ', done' : '');
                    return (
                      <button
                        key={`${block.id}-${iso}`}
                        type="button"
                        className={`cal-blk${density}${done ? ' done' : ''}${
                          typeof block.day === 'string' ? ' off' : ''
                        }`}
                        style={{
                          top: `${((it.s - grid.s) / 60) * CAL_HH}px`,
                          height: `${height - 2}px`,
                          left: `calc(${((col * 100) / cols).toFixed(2)}% + 1px)`,
                          width: `calc(${(100 / cols).toFixed(2)}% - 2px)`,
                        }}
                        aria-label={ariaLabel}
                        aria-haspopup="dialog"
                        onClick={(event) =>
                          setPopover({
                            blockId: block.id,
                            iso,
                            anchor: event.currentTarget,
                          })
                        }
                      >
                        <span className="cb-t">
                          <Icon name={meta.icon} size={11} />
                          {done ? (
                            <Icon name="check" size={11} className="cal-done-mark" />
                          ) : null}
                          <span className="cb-time">
                            {fmtHM(it.s)}–{fmtHM(it.e)}
                          </span>
                        </span>
                        <span className="cb-title">{block.title}</span>
                        <span className="cb-src">
                          {source === 'personal' ? 'Personal' : 'College'}
                        </span>
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
        {DAY_SHORT.map((day) => (
          <b key={day}>{day}</b>
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
          Day, week and month over your blocks. Add a block or import a timetable to plan
          your week.
        </p>
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
          {calendarTitle(mode, anchor)}
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
      />

      <ImportTimetableModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
};

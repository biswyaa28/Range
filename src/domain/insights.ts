import type { AppState, DayStats } from './types';
import type { Clock } from './dates';
import { DAY_SHORT, addDays, defaultClock, fromISO, mondayIndex } from './dates';
import { computeBlockCounts, currentStreak } from './stats';

export type InsightRange = 'week' | '30d';

export interface InsightDay {
  iso: string;
  label: string;
  blocksDone: number;
  blocksTotal: number;
  tasksDone: number;
  focusMinutes: number;
  completion: number | null;
}

export interface InsightSummary {
  range: InsightRange;
  days: InsightDay[];
  blocksDone: number;
  blocksTotal: number;
  completionRate: number | null;
  tasksDone: number;
  focusMinutes: number;
  activeDays: number;
  streak: number;
  goalMinutes: number;
  streakSpark: number[];
  hasActivity: boolean;
}

/** Monday-first week or the last 30 days, both ending today. */
export function insightDayIsos(
  range: InsightRange,
  clock: Clock = defaultClock,
): string[] {
  const today = clock.todayISO();
  if (range === 'week') {
    const monday = addDays(today, -mondayIndex(clock.now(), clock));
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }
  return Array.from({ length: 30 }, (_, index) => addDays(today, -(29 - index)));
}

/** Short chart label: "Mon" for the week, "11/8" for the 30-day view. */
export function insightDayLabel(iso: string, range: InsightRange): string {
  if (range === 'week') {
    const short = DAY_SHORT[mondayIndex(fromISO(iso))] ?? '—';
    return short.charAt(0) + short.slice(1).toLowerCase();
  }
  const date = fromISO(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 0..1 completion, or null when nothing was scheduled. */
export function completionRatio(
  stats: Pick<DayStats, 'blocksDone' | 'blocksTotal'> | undefined,
): number | null {
  if (!stats || stats.blocksTotal <= 0) return null;
  return Math.max(0, Math.min(1, stats.blocksDone / stats.blocksTotal));
}

function todayStats(
  state: Pick<AppState, 'blocks' | 'dayStats'>,
  today: string,
): Record<string, DayStats> {
  const effective: Record<string, DayStats> = { ...state.dayStats };
  const existing = effective[today];
  const counts = computeBlockCounts(state.blocks, today);
  effective[today] = {
    date: today,
    blocksDone: counts.done,
    blocksTotal: counts.total,
    tasksDone: existing?.tasksDone ?? 0,
    focusMinutes: existing?.focusMinutes ?? 0,
    updatedAt: existing?.updatedAt ?? '',
  };
  return effective;
}

/**
 * Aggregates DayStats for the Insights page. Today's block counts are
 * overlaid from the live blocks so a just-checked block is reflected before
 * the next dayStats recompute.
 */
export function buildInsightSummary(
  state: Pick<AppState, 'blocks' | 'dayStats' | 'profile'>,
  range: InsightRange,
  clock: Clock = defaultClock,
): InsightSummary {
  const today = clock.todayISO();
  const stats = todayStats(state, today);
  const isos = insightDayIsos(range, clock);

  const days: InsightDay[] = isos.map((iso) => {
    const day = stats[iso];
    return {
      iso,
      label: insightDayLabel(iso, range),
      blocksDone: day?.blocksDone ?? 0,
      blocksTotal: day?.blocksTotal ?? 0,
      tasksDone: day?.tasksDone ?? 0,
      focusMinutes: day?.focusMinutes ?? 0,
      completion: completionRatio(day),
    };
  });

  const blocksTotal = days.reduce((sum, day) => sum + day.blocksTotal, 0);
  const blocksDone = days.reduce((sum, day) => sum + day.blocksDone, 0);
  const tasksDone = days.reduce((sum, day) => sum + day.tasksDone, 0);
  const focusMinutes = days.reduce((sum, day) => sum + day.focusMinutes, 0);
  const activeDays = days.filter(
    (day) => day.blocksTotal > 0 || day.tasksDone > 0 || day.focusMinutes > 0,
  ).length;

  const studyHours = Number(state.profile.studyHours);
  const goalMinutes = Math.max(1, Number.isFinite(studyHours) ? studyHours : 3) * 60;

  const streakSpark = Array.from({ length: 14 }, (_, index) => {
    const iso = addDays(today, index - 13);
    const ratio = completionRatio(stats[iso]);
    return ratio ?? 0;
  });

  return {
    range,
    days,
    blocksDone,
    blocksTotal,
    completionRate: blocksTotal ? Math.round((blocksDone / blocksTotal) * 100) : null,
    tasksDone,
    focusMinutes,
    activeDays,
    streak: currentStreak(stats, clock),
    goalMinutes,
    streakSpark,
    hasActivity: blocksTotal > 0 || tasksDone > 0 || focusMinutes > 0,
  };
}

export interface InsightChartItem {
  label: string;
  value: number;
}

export interface InsightChartBar {
  index: number;
  label: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InsightChartTick {
  value: number;
  y: number;
  label: string;
}

export interface InsightChartModel {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  baselineY: number;
  maxValue: number;
  labelEvery: number;
  bars: InsightChartBar[];
  ticks: InsightChartTick[];
  goalY: number | null;
  goalLabel: string;
}

export interface InsightChartOptions {
  goal?: number;
  goalLabel?: string;
  minWidth?: number;
  height?: number;
}

/** Legacy nice axis bound: 1/2/5 × power of ten, minimum 5. */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 5) return 5;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const candidates = [1, 2, 5, 10];
  for (const candidate of candidates) {
    if (candidate * power >= value) return candidate * power;
  }
  return 10 * power;
}

/**
 * Builds the hand-drawn SVG bar chart geometry used by the Insights page.
 * The goal line is folded into the axis ceiling so it always stays visible.
 */
export function buildBarChart(
  items: InsightChartItem[],
  options: InsightChartOptions = {},
): InsightChartModel {
  const count = Math.max(1, items.length);
  const goal = options.goal && options.goal > 0 ? options.goal : 0;
  const peak = Math.max(1, goal, ...items.map((item) => item.value));
  const maxValue = niceCeil(peak);

  const width = Math.max(options.minWidth ?? 560, count * 38 + 70);
  const height = options.height ?? 240;
  const padLeft = 48;
  const padRight = 16;
  const padTop = 28;
  const padBottom = 42;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const baselineY = padTop + innerHeight;
  const columnWidth = innerWidth / count;
  const barWidth = Math.min(24, Math.max(2, columnWidth - 10));
  const labelEvery = count <= 8 ? 1 : Math.ceil(count / 8);

  const bars: InsightChartBar[] = items.map((item, index) => {
    const rawHeight = (item.value / maxValue) * innerHeight;
    const barHeight = Math.max(item.value > 0 ? 0 : 3, rawHeight);
    const x = padLeft + index * columnWidth + (columnWidth - barWidth) / 2;
    return {
      index,
      label: item.label,
      value: item.value,
      x,
      y: baselineY - barHeight,
      width: barWidth,
      height: barHeight,
    };
  });

  const ticks: InsightChartTick[] = [0, maxValue / 2, maxValue].map((value) => ({
    value,
    y: baselineY - (value / maxValue) * innerHeight,
    label: String(Number(value.toFixed(1))),
  }));

  const goalY = goal ? baselineY - (Math.min(goal, maxValue) / maxValue) * innerHeight : null;

  return {
    width,
    height,
    padLeft,
    padRight,
    padTop,
    padBottom,
    baselineY,
    maxValue,
    labelEvery,
    bars,
    ticks,
    goalY,
    goalLabel: options.goalLabel ?? 'Goal',
  };
}

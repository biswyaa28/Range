import type { AppState, Block, Deadline, Task } from '@/domain/types';
import {
  addDays,
  fmtHM,
  formatTime,
  hmToMin,
  toISO,
  weekDayIsos,
  weekDayLabels,
  weekIndex,
} from '@/domain/dates';
import { blocksForDate, blockDoneOn } from '@/domain/recurrence';
import { currentStreak } from '@/domain/stats';
import type { Clock } from '@/domain/dates';

/** Everything the Home cards need, computed once per render. */
export interface HomeWeekDay {
  iso: string;
  label: string;
  value: number;
  isToday: boolean;
}

export interface HomeCalendarCell {
  key: string;
  label: string;
  kind: 'head' | 'day' | 'muted';
  iso?: string;
  isToday: boolean;
  hasDeadline: boolean;
}

export interface HomeFocusWindow {
  start: number;
  end: number;
  label: string;
}

export interface HomeData {
  today: string;
  now: string;
  clockFormat: '12h' | '24h';
  nowMinutes: number;
  profileName: string;
  greeting: string;
  weeklyGoal: string;
  studyHours: number;

  blocks: Block[];
  doneBlocks: number;
  totalBlocks: number;
  progress: number;
  nextBlock: Block | null;

  tasks: Task[];
  openTasks: Task[];
  tasksLeft: number;

  liveDeadlines: Deadline[];
  deadlinesTomorrow: number;

  week: HomeWeekDay[];
  hasWeekData: boolean;
  weekMax: number;
  goal: number;

  streak: number;
  spark: number[];
  focusMinutes: number;
  sessions: number;

  wakeWindow: { wake: number; sleep: number };
  focusWindow: HomeFocusWindow | null;

  calendar: {
    monthName: string;
    cells: HomeCalendarCell[];
    monthDue: number;
    nextDeadlines: Deadline[];
  };
}

const BEST_TIMES: Record<string, [number, number]> = {
  Morning: [360, 720],
  Afternoon: [720, 1020],
  Evening: [1020, 1320],
  'Late night': [1320, 1560],
};

export function isInWakingHours(
  hm: string,
  window: { wake: number; sleep: number },
): boolean {
  const minutes = hmToMin(hm);
  return (
    (minutes >= window.wake && minutes < window.sleep) ||
    (minutes + 1440 >= window.wake && minutes + 1440 < window.sleep)
  );
}

export function isInFocusWindow(hm: string, window: HomeFocusWindow | null): boolean {
  if (!window) return false;
  const minutes = hmToMin(hm);
  return (
    (minutes >= window.start && minutes < window.end) ||
    (minutes + 1440 >= window.start && minutes + 1440 < window.end)
  );
}

function dayLabel(short: string): string {
  return short.charAt(0) + short.slice(1).toLowerCase();
}

export function buildHomeData(
  state: AppState,
  now: Date = new Date(),
  weekStart: number = 1,
  clockFormat: '12h' | '24h' = '24h',
): HomeData {
  const today = toISO(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowHM = fmtHM(nowMinutes);
  const profile = state.profile;

  const liveBlocks = state.blocks.filter((block) => !block.deleted);
  const blocks = blocksForDate(liveBlocks, today);
  const doneBlocks = blocks.filter((block) => blockDoneOn(block, today)).length;
  const totalBlocks = blocks.length;
  const progress = totalBlocks ? Math.round((doneBlocks / totalBlocks) * 100) : 0;

  const liveTasks = state.tasks.filter((task) => !task.deleted);
  const openTasks = liveTasks.filter((task) => !task.done);
  const tasks = [...liveTasks].sort((a, b) => Number(a.done) - Number(b.done));

  const liveDeadlines = state.deadlines
    .filter(
      (deadline) =>
        !deadline.deleted && deadline.status !== 'pending' && deadline.status !== 'done',
    )
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const deadlinesTomorrow = liveDeadlines.filter(
    (deadline) => deadline.due === addDays(today, 1),
  ).length;

  const nextBlock =
    blocks.find(
      (block) => !blockDoneOn(block, today) && hmToMin(block.end) > nowMinutes,
    ) ?? null;

  const weekLabels = weekDayLabels(weekStart);
  const week: HomeWeekDay[] = weekDayIsos(today, weekStart).map((iso, index) => {
    const short = weekLabels[index] ?? '';
    const stats = state.dayStats[iso];
    const isToday = iso === today;
    return {
      iso,
      label: dayLabel(short),
      value: isToday ? doneBlocks : stats?.blocksDone ?? 0,
      isToday,
    };
  });

  const goal = Math.max(1, Number(profile.studyHours) || 3);
  const hasWeekData = week.some((day) => day.value > 0);
  const weekMax = Math.max(1, goal, ...week.map((day) => day.value));

  const clock: Clock = {
    now: () => now,
    nowISO: () => now.toISOString(),
    todayISO: () => today,
  };
  const streak = currentStreak(state.dayStats, clock);
  const spark = Array.from({ length: 14 }, (_, index) => {
    const iso = addDays(today, index - 13);
    if (index === 13) return progress / 100;
    const stats = state.dayStats[iso];
    return stats && stats.blocksTotal ? stats.blocksDone / stats.blocksTotal : 0;
  });

  const todayStats = state.dayStats[today];
  const focusMinutes = todayStats?.focusMinutes ?? 0;
  const sessions = Math.floor(focusMinutes / Math.max(1, state.settings.pomodoro.work));

  const wake = hmToMin(profile.wake || '07:00');
  let sleep = hmToMin(profile.sleep || '23:00');
  if (sleep <= wake) sleep += 1440;

  const focusRange = BEST_TIMES[profile.bestTime];
  const focusWindow: HomeFocusWindow | null = focusRange
    ? {
        start: focusRange[0],
        end: focusRange[1],
        label: `${formatTime(focusRange[0], clockFormat)}–${formatTime(focusRange[1], clockFormat)}`,
      }
    : null;

  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lead = weekIndex(firstOfMonth, weekStart);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthKey = today.slice(0, 7);
  const monthDeadlines = state.deadlines.filter(
    (deadline) => !deadline.deleted && deadline.status !== 'done',
  );
  const dueDates = new Set(monthDeadlines.map((deadline) => deadline.due));
  const cells: HomeCalendarCell[] = [];

  weekDayLabels(weekStart).map((label) => label[0] ?? '').forEach((label, index) => {
    cells.push({
      key: `head-${index}`,
      label,
      kind: 'head',
      isToday: false,
      hasDeadline: false,
    });
  });

  for (let offset = lead; offset > 0; offset--) {
    const date = new Date(year, month, 1 - offset);
    cells.push({
      key: `lead-${offset}`,
      label: String(date.getDate()),
      kind: 'muted',
      iso: toISO(date),
      isToday: false,
      hasDeadline: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const iso = toISO(date);
    cells.push({
      key: `day-${day}`,
      label: String(day),
      kind: 'day',
      iso,
      isToday: iso === today,
      hasDeadline: dueDates.has(iso),
    });
  }

  let trailing = 1;
  while ((lead + daysInMonth + trailing - 1) % 7 !== 0) {
    cells.push({
      key: `trail-${trailing}`,
      label: String(trailing),
      kind: 'muted',
      isToday: false,
      hasDeadline: false,
    });
    trailing++;
  }

  const monthDue = monthDeadlines.filter(
    (deadline) => String(deadline.due).slice(0, 7) === monthKey,
  ).length;

  return {
    today,
    now: nowHM,
    clockFormat,
    nowMinutes,
    profileName: profile.name || '',
    greeting: profile.greeting || 'auto',
    weeklyGoal: profile.weeklyGoal || '',
    studyHours: Number(profile.studyHours) || 3,

    blocks,
    doneBlocks,
    totalBlocks,
    progress,
    nextBlock,

    tasks,
    openTasks,
    tasksLeft: openTasks.length,

    liveDeadlines,
    deadlinesTomorrow,

    week,
    hasWeekData,
    weekMax,
    goal,

    streak,
    spark,
    focusMinutes,
    sessions,

    wakeWindow: { wake, sleep },
    focusWindow,

    calendar: {
      monthName: firstOfMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
      cells,
      monthDue,
      nextDeadlines: liveDeadlines.slice(0, 3),
    },
  };
}

import { describe, it, expect } from 'vitest';
import { FixedClock } from '@/domain/dates';
import { defaultState, type Block } from '@/domain/types';
import {
  buildBarChart,
  buildInsightSummary,
  completionRatio,
  insightDayIsos,
  insightDayLabel,
  niceCeil,
} from '@/domain/insights';

const clock = new FixedClock('2026-04-13T10:00:00.000Z'); // Monday
const summaryClock = new FixedClock('2026-04-14T10:00:00.000Z'); // Tuesday

function block(id: string, day: string, done: boolean): Block {
  return {
    id,
    title: id,
    day,
    start: '09:00',
    end: '10:00',
    category: 'study',
    done,
    doneDates: [],
    source: 'personal',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    deleted: false,
    deviceId: 'dev',
  };
}

describe('insight ranges and labels', () => {
  it('builds a Monday-first week ending on Sunday', () => {
    expect(insightDayIsos('week', clock)).toEqual([
      '2026-04-13',
      '2026-04-14',
      '2026-04-15',
      '2026-04-16',
      '2026-04-17',
      '2026-04-18',
      '2026-04-19',
    ]);
  });

  it('builds 30 days ending today', () => {
    const days = insightDayIsos('30d', clock);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-03-15');
    expect(days[29]).toBe('2026-04-13');
  });

  it('formats week and 30-day labels', () => {
    expect(insightDayLabel('2026-04-13', 'week')).toBe('Mon');
    expect(insightDayLabel('2026-04-19', 'week')).toBe('Sun');
    expect(insightDayLabel('2026-04-03', '30d')).toBe('4/3');
  });

  it('returns null completion when nothing was scheduled and clamps ratios', () => {
    expect(completionRatio(undefined)).toBeNull();
    expect(completionRatio({ blocksDone: 0, blocksTotal: 0 })).toBeNull();
    expect(completionRatio({ blocksDone: 2, blocksTotal: 4 })).toBe(0.5);
    expect(completionRatio({ blocksDone: 9, blocksTotal: 4 })).toBe(1);
    expect(completionRatio({ blocksDone: -2, blocksTotal: 4 })).toBe(0);
  });
});

describe('buildInsightSummary', () => {
  it('aggregates real day stats and overlays today from live blocks', () => {
    const state = defaultState();
    state.profile.studyHours = 2;
    state.blocks = [
      block('today-done', '2026-04-14', true),
      block('today-open', '2026-04-14', false),
    ];
    state.dayStats = {
      // Stale counts for today must be replaced by the live blocks.
      '2026-04-14': {
        date: '2026-04-14',
        blocksDone: 0,
        blocksTotal: 4,
        tasksDone: 1,
        focusMinutes: 15,
        updatedAt: '2026-04-14T09:00:00.000Z',
      },
      '2026-04-13': {
        date: '2026-04-13',
        blocksDone: 4,
        blocksTotal: 5,
        tasksDone: 2,
        focusMinutes: 45,
        updatedAt: '2026-04-13T20:00:00.000Z',
      },
    };

    const summary = buildInsightSummary(state, 'week', summaryClock);

    expect(summary.days).toHaveLength(7);
    expect(summary.days[0]?.iso).toBe('2026-04-13');
    expect(summary.days[1]?.iso).toBe('2026-04-14');
    expect(summary.days[1]?.blocksDone).toBe(1);
    expect(summary.days[1]?.blocksTotal).toBe(2);
    expect(summary.days[1]?.completion).toBe(0.5);
    expect(summary.days[1]?.tasksDone).toBe(1);
    expect(summary.days[0]?.completion).toBe(0.8);

    expect(summary.blocksDone).toBe(5);
    expect(summary.blocksTotal).toBe(7);
    expect(summary.completionRate).toBe(71);
    expect(summary.tasksDone).toBe(3);
    expect(summary.focusMinutes).toBe(60);
    expect(summary.activeDays).toBe(2);
    expect(summary.streak).toBe(1);
    expect(summary.goalMinutes).toBe(120);
    expect(summary.streakSpark).toHaveLength(14);
    expect(summary.streakSpark[13]).toBe(0.5);
    expect(summary.hasActivity).toBe(true);
  });

  it('reports an honest empty state with defaults', () => {
    const summary = buildInsightSummary(defaultState(), 'week', clock);
    expect(summary.hasActivity).toBe(false);
    expect(summary.completionRate).toBeNull();
    expect(summary.blocksDone).toBe(0);
    expect(summary.tasksDone).toBe(0);
    expect(summary.focusMinutes).toBe(0);
    expect(summary.activeDays).toBe(0);
    expect(summary.streak).toBe(0);
    expect(summary.goalMinutes).toBe(180);
  });

  it('falls back to a 3 hour goal when studyHours is not finite', () => {
    const state = defaultState();
    state.profile.studyHours = Number.NaN;
    expect(buildInsightSummary(state, '30d', clock).goalMinutes).toBe(180);
  });
});

describe('chart geometry', () => {
  it('rounds axis bounds to 1/2/5 steps with a minimum of 5', () => {
    expect(niceCeil(0)).toBe(5);
    expect(niceCeil(5)).toBe(5);
    expect(niceCeil(5.1)).toBe(10);
    expect(niceCeil(12)).toBe(20);
    expect(niceCeil(30)).toBe(50);
    expect(niceCeil(90)).toBe(100);
    expect(niceCeil(250)).toBe(500);
    expect(niceCeil(1000)).toBe(1000);
    expect(niceCeil(Number.POSITIVE_INFINITY)).toBe(5);
  });

  it('lays out week bars, baseline, ticks and labels', () => {
    const items = [0, 1, 2, 3, 4, 5, 6].map((value, index) => ({
      label: `D${index}`,
      value,
    }));
    const chart = buildBarChart(items);

    expect(chart.width).toBe(560);
    expect(chart.height).toBe(240);
    expect(chart.maxValue).toBe(10);
    expect(chart.labelEvery).toBe(1);
    expect(chart.bars).toHaveLength(7);
    expect(chart.ticks.map((tick) => tick.label)).toEqual(['0', '5', '10']);
    expect(chart.baselineY).toBe(198);
    expect(chart.goalY).toBeNull();

    const zero = chart.bars[0];
    const peak = chart.bars[6];
    expect(zero?.height).toBe(3);
    expect(zero?.y).toBe(195);
    expect(peak?.height).toBe(102);
    expect(peak?.y).toBe(96);
    expect(chart.bars[1]?.x).toBeGreaterThan(chart.bars[0]?.x ?? 0);
  });

  it('keeps the goal line visible and thins 30-day labels', () => {
    const items = Array.from({ length: 30 }, (_, index) => ({
      label: `D${index}`,
      value: index % 4 === 0 ? 10 : 0,
    }));
    const chart = buildBarChart(items, { goal: 120, goalLabel: 'Daily goal 120 min' });

    expect(chart.width).toBe(1210);
    expect(chart.maxValue).toBe(200);
    expect(chart.labelEvery).toBe(4);
    expect(chart.goalLabel).toBe('Daily goal 120 min');
    expect(chart.goalY).not.toBeNull();
    expect(chart.goalY ?? 0).toBeGreaterThan(chart.padTop);
    expect(chart.goalY ?? 0).toBeLessThan(chart.baselineY);
    expect(chart.goalY).toBe(198 - (120 / 200) * (198 - 28));
  });

  it('honours explicit height and minimum width', () => {
    const chart = buildBarChart([{ label: 'A', value: 1 }], {
      height: 300,
      minWidth: 750,
    });
    expect(chart.height).toBe(300);
    expect(chart.width).toBe(750);
    expect(chart.baselineY).toBe(28 + (300 - 28 - 42));
  });
});

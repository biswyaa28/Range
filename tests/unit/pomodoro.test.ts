import { describe, it, expect } from 'vitest';
import {
  PomodoroEngine,
  MAX_BREAK_MIN,
  MAX_WORK_MIN,
  MIN_BREAK_MIN,
  MIN_WORK_MIN,
  type PomodoroSessionEnd,
} from '@/engines/pomodoro';
import {
  DEFAULT_FOCUS_DURATIONS,
  FOCUS_MIN,
  effectivePomodoroDurations,
} from '@/domain/focusPresets';

const MIN = 60_000;

function makeEngine(options: {
  now: () => number;
  workMin?: number;
  breakMin?: number;
  onSessionEnd?: (info: PomodoroSessionEnd) => void;
}) {
  return new PomodoroEngine(options);
}

describe('PomodoroEngine', () => {
  it('starts with the configured work block and counts down from timestamps', () => {
    let now = 1_000;
    const engine = makeEngine({ now: () => now });

    expect(engine.getSnapshot()).toMatchObject({
      mode: 'work',
      running: false,
      remainingMs: 25 * MIN,
      totalMs: 25 * MIN,
      workMin: 25,
      breakMin: 5,
    });

    engine.start();
    expect(engine.getSnapshot().running).toBe(true);

    now += 10 * MIN;
    expect(engine.tick()).toBe(false);
    expect(engine.getSnapshot().remainingMs).toBe(15 * MIN);

    engine.pause();
    now += 10 * MIN;
    // Paused time does not drain the timer.
    expect(engine.tick()).toBe(false);
    expect(engine.getSnapshot().remainingMs).toBe(15 * MIN);
  });

  it('does not drift when a throttled tick arrives late', () => {
    let now = 0;
    const ends: PomodoroSessionEnd[] = [];
    const engine = makeEngine({
      now: () => now,
      onSessionEnd: (info) => ends.push(info),
    });

    engine.start();
    now = 26 * MIN;
    expect(engine.tick()).toBe(true);

    const snapshot = engine.getSnapshot();
    expect(snapshot.mode).toBe('break');
    expect(snapshot.running).toBe(true);
    // One minute of the break was already consumed by the overshoot.
    expect(snapshot.remainingMs).toBe(4 * MIN);
    expect(ends).toEqual([{ mode: 'work', minutes: 25 }]);
  });

  it('catches up across several blocks after a very long gap', () => {
    let now = 0;
    const ends: PomodoroSessionEnd[] = [];
    const engine = makeEngine({
      now: () => now,
      onSessionEnd: (info) => ends.push(info),
    });

    engine.start();
    now = 180 * MIN;
    expect(engine.tick()).toBe(true);

    const workSessions = ends.filter((event) => event.mode === 'work');
    const breakSessions = ends.filter((event) => event.mode === 'break');
    expect(workSessions).toHaveLength(6);
    expect(breakSessions).toHaveLength(6);
    expect(workSessions.reduce((sum, event) => sum + event.minutes, 0)).toBe(150);
    expect(engine.getSnapshot().mode).toBe('work');
  });

  it('completes a block on pause and switches without auto-starting', () => {
    let now = 0;
    const engine = makeEngine({ now: () => now });

    engine.start();
    now = 25 * MIN;
    engine.pause();

    const snapshot = engine.getSnapshot();
    expect(snapshot.mode).toBe('break');
    expect(snapshot.running).toBe(false);
    expect(snapshot.remainingMs).toBe(5 * MIN);
  });

  it('honours holdOnComplete so Focus Mode can show the done state', () => {
    let now = 0;
    const ends: PomodoroSessionEnd[] = [];
    const engine = makeEngine({
      now: () => now,
      onSessionEnd: (info) => ends.push(info),
    });

    engine.setHoldOnComplete(true);
    engine.start();
    now = 25 * MIN;
    engine.tick();

    expect(engine.getSnapshot()).toMatchObject({
      mode: 'break',
      running: false,
      remainingMs: 5 * MIN,
    });
    expect(ends).toEqual([{ mode: 'work', minutes: 25 }]);

    engine.start();
    now += 5 * MIN;
    engine.tick();
    expect(engine.getSnapshot()).toMatchObject({
      mode: 'work',
      running: false,
      remainingMs: 25 * MIN,
    });
    expect(ends).toHaveLength(2);
  });

  it('skips, adds minutes and clamps configured durations', () => {
    const now = 0;
    const engine = makeEngine({ now: () => now });

    engine.skip();
    expect(engine.getSnapshot()).toMatchObject({
      mode: 'break',
      running: false,
      remainingMs: 5 * MIN,
    });

    engine.addMinutes(5);
    expect(engine.getSnapshot().remainingMs).toBe(10 * MIN);

    engine.setDurations(200, 2);
    expect(engine.workMinutes).toBe(MAX_WORK_MIN);
    expect(engine.breakMinutes).toBe(MIN_BREAK_MIN);
    expect(engine.getSnapshot().totalMs).toBe(MIN_BREAK_MIN * MIN);

    engine.setDurations(1, 100);
    expect(engine.workMinutes).toBe(MIN_WORK_MIN);
    expect(engine.breakMinutes).toBe(MAX_BREAK_MIN);

    engine.setDurations(Number.NaN, Number.NaN);
    expect(engine.workMinutes).toBe(MIN_WORK_MIN);
    expect(engine.breakMinutes).toBe(MIN_BREAK_MIN);
  });

  it('resizes an idle full timer and leaves a running one alone', () => {
    let now = 0;
    const engine = makeEngine({ now: () => now });

    engine.setDurations(50, 10);
    expect(engine.getSnapshot().remainingMs).toBe(50 * MIN);

    engine.start();
    now += 5 * MIN;
    engine.tick();
    engine.setDurations(30, 10);
    expect(engine.workMinutes).toBe(30);
    expect(engine.getSnapshot().remainingMs).toBe(45 * MIN);

    engine.reset();
    expect(engine.getSnapshot()).toMatchObject({
      mode: 'work',
      running: false,
      remainingMs: 30 * MIN,
    });
  });

  it('notifies subscribers and isolates observer failures', () => {
    let now = 0;
    let updates = 0;
    const engine = makeEngine({ now: () => now });
    const unsubscribe = engine.subscribe(() => {
      updates += 1;
    });
    engine.onSessionComplete(() => {
      throw new Error('observer failure');
    });

    engine.start();
    now = 25 * MIN;
    expect(() => engine.tick()).not.toThrow();
    unsubscribe();
    engine.skip();

    expect(updates).toBe(2);
  });
});

describe('focus-style duration presets', () => {
  it('maps every legacy focus style to its work/break pair', () => {
    expect(FOCUS_MIN.pomodoro).toEqual([25, 5]);
    expect(FOCUS_MIN.deep).toEqual([50, 10]);
    expect(FOCUS_MIN.long).toEqual([90, 20]);
  });

  it('seeds the timer from the profile style while settings are untouched', () => {
    expect(effectivePomodoroDurations('deep', DEFAULT_FOCUS_DURATIONS)).toEqual({
      work: 50,
      break: 10,
    });
    expect(effectivePomodoroDurations('long', DEFAULT_FOCUS_DURATIONS)).toEqual({
      work: 90,
      break: 20,
    });
    expect(effectivePomodoroDurations('pomodoro', DEFAULT_FOCUS_DURATIONS)).toEqual({
      work: 25,
      break: 5,
    });
  });

  it('lets customised durations win and ignores unknown styles', () => {
    expect(effectivePomodoroDurations('deep', { work: 30, break: 10 })).toEqual({
      work: 30,
      break: 10,
    });
    expect(effectivePomodoroDurations('unknown', DEFAULT_FOCUS_DURATIONS)).toEqual({
      work: 25,
      break: 5,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildLiveSentence,
  buildSmartGreeting,
  formatCountdown,
  greetingWord,
  plural,
} from '@/domain/homeGreeting';

const base = {
  nowMinutes: 9 * 60,
  deadlinesTomorrow: 0,
  tasksLeft: 0,
  nextBlock: null,
};

describe('home greeting copy', () => {
  it('chooses the greeting style from the profile or the hour', () => {
    expect(greetingWord('hey', 9)).toBe('Hey');
    expect(greetingWord('auto', 8)).toBe('Good morning');
    expect(greetingWord('auto', 13)).toBe('Good afternoon');
    expect(greetingWord('auto', 20)).toBe('Good evening');
  });

  it('formats a next class countdown with hours and minutes', () => {
    expect(
      buildLiveSentence({
        ...base,
        nextBlock: { title: 'DSA Lecture', category: 'class', start: '10:30', end: '11:30' },
      }),
    ).toBe('Next class in 1 h 30 min.');
  });

  it('formats short countdowns and non-class blocks', () => {
    expect(
      buildLiveSentence({
        ...base,
        nextBlock: { title: 'Gym', category: 'exercise', start: '09:45', end: '10:30' },
      }),
    ).toBe('Next block in 45 min.');
  });

  it('uses the block title when it is already running', () => {
    expect(
      buildLiveSentence({
        ...base,
        nowMinutes: 10 * 60,
        nextBlock: { title: 'Data Structures Lab', category: 'class', start: '09:30', end: '11:00' },
      }),
    ).toBe('Data Structures Lab is on now.');
  });

  it('joins deadline and task clauses in legacy order', () => {
    expect(
      buildLiveSentence({
        ...base,
        nextBlock: { title: 'DSA Lecture', category: 'class', start: '10:30', end: '11:30' },
        deadlinesTomorrow: 2,
        tasksLeft: 3,
      }),
    ).toBe('Next class in 1 h 30 min. 2 deadlines tomorrow. 3 tasks left.');
  });

  it('uses singular wording and omits empty clauses', () => {
    expect(
      buildLiveSentence({ ...base, deadlinesTomorrow: 1, tasksLeft: 1 }),
    ).toBe('1 deadline tomorrow. 1 task left.');
  });

  it('handles the clear-day case', () => {
    expect(buildLiveSentence(base)).toBe('You’re clear for today.');
  });

  it('builds the full smart greeting with a fallback name and goal tip', () => {
    const copy = buildSmartGreeting({
      ...base,
      name: '  ',
      greeting: 'auto',
      hour: 8,
      weeklyGoal: 'Exam prep',
    });
    expect(copy.salutation).toBe('Good morning');
    expect(copy.name).toBe('there');
    expect(copy.sentence).toBe('You’re clear for today.');
    expect(copy.tip).toBe('Tip: schedule a focus block for your weakest subject.');
  });

  it('exposes countdown and plural helpers', () => {
    expect(formatCountdown(0)).toBe('0 min');
    expect(formatCountdown(59)).toBe('59 min');
    expect(formatCountdown(60)).toBe('1 h 0 min');
    expect(formatCountdown(125)).toBe('2 h 5 min');
    expect(plural(1, 'task')).toBe('1 task');
    expect(plural(0, 'task')).toBe('0 tasks');
  });
});

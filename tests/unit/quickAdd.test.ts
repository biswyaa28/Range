import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from '@/domain/quickAdd';
import { FixedClock } from '@/domain/dates';

describe('domain quickAdd NLP parser', () => {
  const clock = new FixedClock('2026-04-13T10:00:00.000Z'); // Monday 2026-04-13

  it('1. parses plain task', () => {
    const res = parseQuickAdd('Buy groceries', clock);
    expect(res.kind).toBe('task');
    if (res.kind === 'task') {
      expect(res.title).toBe('Buy groceries');
      expect(res.priority).toBe('med');
      expect(res.due).toBeNull();
    }
  });

  it('2. parses task with "today"', () => {
    const res = parseQuickAdd('Review math lecture today', clock);
    expect(res.kind).toBe('task');
    if (res.kind === 'task') {
      expect(res.title).toBe('Review math lecture');
      expect(res.due).toBe('2026-04-13');
    }
  });

  it('3. parses task with "tomorrow"', () => {
    const res = parseQuickAdd('Call advisor tomorrow', clock);
    expect(res.kind).toBe('task');
    if (res.kind === 'task') {
      expect(res.title).toBe('Call advisor');
      expect(res.due).toBe('2026-04-14');
    }
  });

  it('4. parses high priority (urgent)', () => {
    const res = parseQuickAdd('Submit scholarship form urgent', clock);
    expect(res.kind).toBe('task');
    if (res.kind === 'task') {
      expect(res.title).toBe('Submit scholarship form');
      expect(res.priority).toBe('high');
    }
  });

  it('5. parses high priority (p1)', () => {
    const res = parseQuickAdd('Fix critical bug p1', clock);
    expect(res.kind).toBe('task');
    if (res.kind === 'task') {
      expect(res.priority).toBe('high');
      expect(res.title).toBe('Fix critical bug');
    }
  });

  it('6. parses low priority (p3)', () => {
    const res = parseQuickAdd('Water plants p3', clock);
    expect(res.kind).toBe('task');
    if (res.kind === 'task') {
      expect(res.priority).toBe('low');
      expect(res.title).toBe('Water plants');
    }
  });

  it('7. parses weekday task (on Friday)', () => {
    const res = parseQuickAdd('Submit essay on Friday', clock);
    expect(res.kind).toBe('task');
    if (res.kind === 'task') {
      expect(res.title).toBe('Submit essay');
      expect(res.due).toBe('2026-04-17'); // Friday
    }
  });

  it('8. parses block with time range "4-6pm"', () => {
    const res = parseQuickAdd('Study group 4-6pm', clock);
    expect(res.kind).toBe('block');
    if (res.kind === 'block') {
      expect(res.title).toBe('Study group');
      expect(res.start).toBe('16:00');
      expect(res.end).toBe('18:00');
      expect(res.day).toBe(0); // Monday
    }
  });

  it('9. parses block with "10:00 to 11:30"', () => {
    const res = parseQuickAdd('DSA Lecture 10:00 to 11:30', clock);
    expect(res.kind).toBe('block');
    if (res.kind === 'block') {
      expect(res.title).toBe('DSA Lecture');
      expect(res.start).toBe('10:00');
      expect(res.end).toBe('11:30');
    }
  });

  it('10. parses block with "at 3pm"', () => {
    const res = parseQuickAdd('Team sync at 3pm', clock);
    expect(res.kind).toBe('block');
    if (res.kind === 'block') {
      expect(res.title).toBe('Team sync');
      expect(res.start).toBe('15:00');
      expect(res.end).toBe('16:00');
    }
  });

  it('11. parses block with weekday and time range', () => {
    const res = parseQuickAdd('Physics Lab Wednesday 2-4pm', clock);
    expect(res.kind).toBe('block');
    if (res.kind === 'block') {
      expect(res.title).toBe('Physics Lab');
      expect(res.start).toBe('14:00');
      expect(res.end).toBe('16:00');
      expect(res.day).toBe(2); // Wednesday (0=Mon, 1=Tue, 2=Wed)
    }
  });

  it('12. parses block with "tomorrow" and time range', () => {
    const res = parseQuickAdd('Gym workout tomorrow 7-8am', clock);
    expect(res.kind).toBe('block');
    if (res.kind === 'block') {
      expect(res.title).toBe('Gym workout');
      expect(res.start).toBe('07:00');
      expect(res.end).toBe('08:00');
      expect(res.day).toBe(1); // Tuesday
    }
  });

  it('13. parses combined task with priority and tomorrow', () => {
    const res = parseQuickAdd('Pay rent tomorrow urgent', clock);
    expect(res.kind).toBe('task');
    if (res.kind === 'task') {
      expect(res.title).toBe('Pay rent');
      expect(res.due).toBe('2026-04-14');
      expect(res.priority).toBe('high');
    }
  });
});

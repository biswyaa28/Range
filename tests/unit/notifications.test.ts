import { describe, it, expect } from 'vitest';
import { planNotifications } from '@/domain/notifications';
import type { NotificationSettings } from '@/domain/settings';
import type { Block, Deadline, Task } from '@/domain/types';

const base = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deleted: false,
  deviceId: 'test',
};

function settings(patch: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    enabled: true,
    deadlines: false,
    tasks: false,
    focus: false,
    weeklyDigest: false,
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    ...patch,
  };
}

function block(patch: Partial<Block> = {}): Block {
  return {
    ...base,
    id: 'b1',
    title: 'Study',
    day: '2026-11-13',
    start: '09:00',
    end: '10:00',
    category: 'study',
    done: false,
    doneDates: [],
    ...patch,
  };
}

function task(patch: Partial<Task> = {}): Task {
  return {
    ...base,
    id: 't1',
    title: 'Essay',
    due: '2026-11-13',
    priority: 'med',
    done: false,
    category: '',
    ...patch,
  };
}

function deadline(patch: Partial<Deadline> = {}): Deadline {
  return {
    ...base,
    id: 'd1',
    title: 'Assignment',
    course: 'CS',
    due: '2026-11-13',
    type: 'assignment',
    status: 'pending',
    source: 'personal',
    ...patch,
  };
}

// Thursday 12 November 2026, 08:00 local time.
const now = new Date(2026, 10, 12, 8, 0, 0);

describe('planNotifications', () => {
  it('returns nothing when notifications are off', () => {
    expect(
      planNotifications({
        blocks: [block()],
        deadlines: [],
        tasks: [],
        settings: settings({ enabled: false, focus: true }),
        now,
      }),
    ).toEqual([]);
  });

  it('plans block reminders inside the 14-day window', () => {
    const planned = planNotifications({
      blocks: [block(), block({ id: 'b2', day: '2026-11-30' })],
      deadlines: [],
      tasks: [],
      settings: settings({ focus: true }),
      now,
    });
    expect(planned).toHaveLength(1);
    expect(planned[0]?.kind).toBe('focus');
    expect(new Date(planned[0]!.at).getHours()).toBe(9);
    expect(planned[0]?.body).toContain('Study');
  });

  it('skips reminders inside quiet hours', () => {
    const planned = planNotifications({
      blocks: [block()],
      deadlines: [deadline()],
      tasks: [task()],
      settings: settings({
        focus: true,
        deadlines: true,
        tasks: true,
        quietHours: { enabled: true, start: '08:00', end: '10:00' },
      }),
      now,
    });
    // Block starts at 09:00 and the 09:00 deadline/task nudges both fall inside.
    expect(planned).toEqual([]);
  });

  it('respects each reminder toggle', () => {
    const planned = planNotifications({
      blocks: [block()],
      deadlines: [deadline()],
      tasks: [task()],
      settings: settings({ deadlines: true }),
      now,
    });
    expect(planned.map((item) => item.kind)).toEqual(['deadline']);
    expect(planned[0]?.title).toBe('Deadline today');
  });

  it('caps the plan at 60 sorted reminders', () => {
    const many: Block[] = [];
    for (let day = 12; day <= 20; day++) {
      for (let index = 0; index < 10; index++) {
        many.push(
          block({
            id: `b-${day}-${index}`,
            day: `2026-11-${day}`,
            start: `${String(10 + index).padStart(2, '0')}:00`,
          }),
        );
      }
    }
    const planned = planNotifications({
      blocks: many,
      deadlines: [],
      tasks: [],
      settings: settings({ focus: true }),
      now,
    });
    expect(planned).toHaveLength(60);
    const times = planned.map((item) => item.at);
    expect(times).toEqual([...times].sort());
  });
});

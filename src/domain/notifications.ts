import { addDays, hmToMin, toISO } from './dates';
import { blocksForDate } from './recurrence';
import { habitDone, habitIsScheduled } from './habits';
import type { Block, Deadline, Habit, Task } from './types';
import type { NotificationSettings } from './settings';

export type NotificationKind = 'focus' | 'deadline' | 'task' | 'digest' | 'habit';

export interface PlannedNotification {
  id: number;
  /** ISO timestamp of the delivery time. */
  at: string;
  title: string;
  body: string;
  kind: NotificationKind;
}

export interface NotificationPlanInput {
  blocks: Block[];
  deadlines: Deadline[];
  tasks: Task[];
  habits?: Habit[];
  settings: NotificationSettings;
  now?: Date;
}

const HORIZON_DAYS = 14;
const MAX_NOTIFICATIONS = 60;
const MORNING_MINUTES = 9 * 60;
const DIGEST_MINUTES = 18 * 60;

function withinQuietHours(
  date: Date,
  quiet: NotificationSettings['quietHours'],
): boolean {
  if (!quiet.enabled) return false;
  const minute = date.getHours() * 60 + date.getMinutes();
  const start = hmToMin(quiet.start);
  const end = hmToMin(quiet.end);
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Stable 31-bit id so cancelling and rescheduling never collide. */
export function notificationId(kind: NotificationKind, key: string): number {
  let hash = 0;
  const text = `${kind}:${key}`;
  for (let index = 0; index < text.length; index++) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return (Math.abs(hash) % 2_000_000_000) + 1;
}

function atMinutes(iso: string, minutes: number): Date {
  const date = new Date(`${iso}T00:00:00`);
  date.setMinutes(minutes);
  return date;
}

/**
 * Builds the next 14 days of local reminders. Pure: it depends only on the
 * passed state, settings and clock, and never includes note content.
 */
export function planNotifications({
  blocks,
  deadlines,
  tasks,
  habits = [],
  settings,
  now = new Date(),
}: NotificationPlanInput): PlannedNotification[] {
  if (!settings.enabled) return [];

  const out: PlannedNotification[] = [];
  const today = toISO(now);

  for (let offset = 0; offset < HORIZON_DAYS; offset++) {
    const iso = addDays(today, offset);
    const dayBlocks = blocksForDate(blocks, iso);
    if (settings.focus) {
      for (const block of dayBlocks) {
        const at = atMinutes(iso, hmToMin(block.start));
        if (at.getTime() <= now.getTime()) continue;
        if (withinQuietHours(at, settings.quietHours)) continue;
        out.push({
          id: notificationId('focus', `${block.id}:${iso}`),
          at: at.toISOString(),
          title: 'Block starting',
          body: `${block.title} starts now.`,
          kind: 'focus',
        });
      }
    }

    if (settings.deadlines) {
      const at = atMinutes(iso, MORNING_MINUTES);
      if (at.getTime() > now.getTime() && !withinQuietHours(at, settings.quietHours)) {
        for (const deadline of deadlines) {
          if (deadline.deleted || deadline.status !== 'pending') continue;
          if (deadline.due !== iso) continue;
          out.push({
            id: notificationId('deadline', `${deadline.id}:${iso}`),
            at: at.toISOString(),
            title: 'Deadline today',
            body: deadline.title,
            kind: 'deadline',
          });
        }
      }
    }

    for (const habit of habits) {
      if (habit.deleted || !habit.reminder || !habitIsScheduled(habit, iso)) continue;
      if (habitDone(habit, iso)) continue;
      const at = atMinutes(iso, hmToMin(habit.reminder));
      if (at.getTime() <= now.getTime()) continue;
      if (withinQuietHours(at, settings.quietHours)) continue;
      out.push({
        id: notificationId('habit', `${habit.id}:${iso}`),
        at: at.toISOString(),
        title: 'Habit reminder',
        body: habit.title,
        kind: 'habit',
      });
    }

    if (settings.tasks) {
      const at = atMinutes(iso, MORNING_MINUTES);
      if (at.getTime() > now.getTime() && !withinQuietHours(at, settings.quietHours)) {
        for (const task of tasks) {
          if (task.deleted || task.done || task.due !== iso) continue;
          out.push({
            id: notificationId('task', `${task.id}:${iso}`),
            at: at.toISOString(),
            title: 'Task due today',
            body: task.title,
            kind: 'task',
          });
        }
      }
    }
  }

  if (settings.weeklyDigest) {
    // Next Sunday at 18:00, or today if it is still ahead.
    const daysUntilSunday = (7 - now.getDay()) % 7;
    for (let week = 0; week < 2; week++) {
      const iso = addDays(today, daysUntilSunday + week * 7);
      const at = atMinutes(iso, DIGEST_MINUTES);
      if (at.getTime() <= now.getTime()) continue;
      if (withinQuietHours(at, settings.quietHours)) continue;
      out.push({
        id: notificationId('digest', iso),
        at: at.toISOString(),
        title: 'Weekly review',
        body: 'Your week at a glance.',
        kind: 'digest',
      });
    }
  }

  return out
    .sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id)
    .slice(0, MAX_NOTIFICATIONS);
}

import React, { useMemo, useState } from 'react';
import { addDays, todayISO } from '@/domain/dates';
import {
  currentStreak,
  habitDone,
  habitIsScheduled,
  habitScheduleLabel,
  toggleHabitCheckin,
} from '@/domain/habits';
import type { Habit, HabitSchedule } from '@/domain/types';
import { store, useStore } from '@/store';
import { stampNewRecord, softDeleteRecord, touchRecord } from '@/store/stamp';
import { Icon } from '@/ui/Icon';
import { Haptics } from '@/engines/haptics';
import './HabitStrip.css';

function newHabit(title: string, schedule: HabitSchedule, reminder: string | null): Habit {
  let created: Habit | null = null;
  store.set((state) => {
    const habit = stampNewRecord<Partial<Habit>>(
      { title, schedule, checkins: [], reminder },
      state.deviceId,
      () => crypto.randomUUID(),
    ) as Habit;
    created = habit;
    state.habits.push(habit);
  });
  if (!created) throw new Error('Could not create habit');
  return created;
}

export const HabitStrip: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const habits = useStore((state) => state.habits);
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [schedule, setSchedule] = useState<HabitSchedule>('daily');
  const [reminder, setReminder] = useState('');

  const live = useMemo(
    () =>
      habits
        .filter((habit) => !habit.deleted)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    [habits],
  );
  const due = live.filter((habit) => habitIsScheduled(habit, today));

  const checkIn = (habit: Habit) => {
    store.set((state) => {
      const current = state.habits.find((entry) => entry.id === habit.id);
      if (!current) return;
      current.checkins = toggleHabitCheckin(current, today);
      touchRecord(current);
    });
    Haptics.select();
  };

  const setHabitReminder = (habit: Habit, value: string) => {
    store.set((state) => {
      const current = state.habits.find((entry) => entry.id === habit.id);
      if (!current) return;
      current.reminder = value || null;
      touchRecord(current);
    });
  };

  const remove = (habit: Habit) => {
    store.set((state) => {
      softDeleteRecord(state.habits, habit.id);
    });
    Haptics.warning();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    newHabit(value, schedule, reminder || null);
    setTitle('');
    setReminder('');
    setAdding(false);
    Haptics.success();
  };

  return (
    <section className={`habit-strip${compact ? ' compact' : ''}`} aria-labelledby="habit-title">
      <div className="habit-strip-head">
        <h2 id="habit-title">
          Habits <span className="chip">{due.filter((habit) => habitDone(habit, today)).length}/{due.length}</span>
        </h2>
        <button
          type="button"
          className="ibtn"
          data-action="habit-add"
          aria-label="Add habit"
          title="Add habit"
          onClick={() => setAdding((value) => !value)}
        >
          <Icon name={adding ? 'x' : 'plus'} size={16} />
        </button>
      </div>

      {adding && (
        <form className="habit-add" onSubmit={submit}>
          <label className="sr-only" htmlFor="habit-name">
            Habit name
          </label>
          <input
            id="habit-name"
            value={title}
            maxLength={90}
            placeholder="Habit name"
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
          <select
            aria-label="Habit schedule"
            value={schedule}
            onChange={(event) => setSchedule(event.target.value as HabitSchedule)}
          >
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays</option>
          </select>
          <input
            type="time"
            aria-label="Reminder time (optional)"
            value={reminder}
            onChange={(event) => setReminder(event.target.value)}
          />
          <button type="submit" className="btn yellow" data-action="habit-create" disabled={!title.trim()}>
            Add
          </button>
        </form>
      )}

      {live.length === 0 ? (
        <p className="hint habit-empty">Add a small daily habit to start a streak.</p>
      ) : (
        <ul className="habit-list">
          {live.map((habit) => {
            const isDue = habitIsScheduled(habit, today);
            const done = habitDone(habit, today);
            const streak = currentStreak(habit, today);
            return (
              <li key={habit.id} className={`habit-row${done ? ' done' : ''}${isDue ? '' : ' rest'}`}>
                <button
                  type="button"
                  className="habit-check"
                  data-action="habit-check"
                  data-id={habit.id}
                  aria-pressed={done}
                  aria-label={`${done ? 'Undo check-in for' : 'Check in'} ${habit.title} today`}
                  disabled={!isDue}
                  onClick={() => checkIn(habit)}
                >
                  {done ? <Icon name="check" size={16} /> : <span aria-hidden="true" />}
                </button>
                <span className="habit-name">
                  {habit.title}
                  <small>{habitScheduleLabel(habit)}</small>
                </span>
                <span className="habit-streak" title="Current streak">
                  {streak}
                  <small>day{streak === 1 ? '' : 's'}</small>
                </span>
                <input
                  type="time"
                  className="habit-reminder"
                  aria-label={`Reminder for ${habit.title}`}
                  value={habit.reminder ?? ''}
                  onChange={(event) => setHabitReminder(habit, event.target.value)}
                />
                <button
                  type="button"
                  className="ibtn habit-delete"
                  aria-label={`Delete ${habit.title}`}
                  onClick={() => remove(habit)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

/** Used by tests and Insights to show the last seven scheduled days. */
export function habitHistory(habit: Habit, today: string): Array<{ iso: string; done: boolean; scheduled: boolean }> {
  return Array.from({ length: 7 }, (_, index) => {
    const iso = addDays(today, index - 6);
    return { iso, done: habitDone(habit, iso), scheduled: habitIsScheduled(habit, iso) };
  });
}

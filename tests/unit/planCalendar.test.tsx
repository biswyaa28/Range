import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Block } from '@/domain/types';
import { defaultState } from '@/domain/types';
import {
  addDays,
  fromISO,
  mondayIndex,
  todayISO,
} from '@/domain/dates';
import { store } from '@/store';
import { ToastProvider } from '@/ui/Toast';
import { CalendarView } from '@/features/plan/CalendarView';

function makeBlock(partial: Partial<Block> & Pick<Block, 'id' | 'title'>): Block {
  return {
    day: 0,
    start: '09:00',
    end: '10:00',
    category: 'class',
    done: false,
    doneDates: [],
    source: 'college',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deleted: false,
    deviceId: 'test-device',
    ...partial,
  };
}

function renderCalendar() {
  return render(
    <ToastProvider>
      <CalendarView />
    </ToastProvider>,
  );
}

describe('CalendarView', () => {
  const today = todayISO();
  const todayWeekday = mondayIndex(fromISO(today));

  beforeEach(() => {
    store.importAll(defaultState());
  });

  it('shows a weekly block on every matching week and hides it on other days', () => {
    store.set((state) => {
      state.blocks.push(
        makeBlock({
          id: 'weekly-1',
          title: 'DSA Lecture',
          day: todayWeekday,
        }),
      );
    });

    renderCalendar();

    const label = 'DSA Lecture, 09:00 to 10:00, college';
    expect(screen.getAllByRole('button', { name: label })).toHaveLength(1);

    fireEvent.keyDown(window, { key: ']' });
    expect(screen.getAllByRole('button', { name: label })).toHaveLength(1);

    fireEvent.keyDown(window, { key: 'd' });
    expect(screen.getByRole('button', { name: label })).toBeDefined();

    fireEvent.keyDown(window, { key: ']' });
    expect(screen.queryByRole('button', { name: label })).toBeNull();
  });

  it('lays overlapping blocks side by side', () => {
    store.set((state) => {
      state.blocks.push(
        makeBlock({
          id: 'overlap-a',
          title: 'Overlap A',
          day: today,
          start: '09:00',
          end: '10:00',
        }),
        makeBlock({
          id: 'overlap-b',
          title: 'Overlap B',
          day: today,
          start: '09:30',
          end: '10:30',
        }),
      );
    });

    renderCalendar();
    fireEvent.keyDown(window, { key: 'd' });

    const first = screen.getByRole('button', { name: /Overlap A/ });
    const second = screen.getByRole('button', { name: /Overlap B/ });

    expect(first.style.left).toBe('calc(0% + 1px)');
    expect(first.style.width).toBe('calc(50% - 2px)');
    expect(second.style.left).toBe('calc(50% + 1px)');
    expect(second.style.width).toBe('calc(50% - 2px)');
  });

  it('tracks done state per date for weekly blocks', () => {
    const nextWeek = addDays(today, 7);
    store.set((state) => {
      state.blocks.push(
        makeBlock({
          id: 'done-weekly',
          title: 'Weekly Done',
          day: todayWeekday,
          doneDates: [today],
        }),
      );
    });

    renderCalendar();

    expect(
      screen.getByRole('button', {
        name: 'Weekly Done, 09:00 to 10:00, college, done',
      }),
    ).toBeDefined();

    fireEvent.keyDown(window, { key: ']' });

    const nextWeekBlock = screen.getByRole('button', {
      name: 'Weekly Done, 09:00 to 10:00, college',
    });
    fireEvent.click(nextWeekBlock);
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));

    expect(
      screen.getByRole('button', {
        name: 'Weekly Done, 09:00 to 10:00, college, done',
      }),
    ).toBeDefined();

    const saved = store.get().blocks.find((block) => block.id === 'done-weekly');
    expect(saved?.doneDates).toContain(today);
    expect(saved?.doneDates).toContain(nextWeek);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Weekly Done, 09:00 to 10:00, college, done',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark not done' }));

    const afterUndo = store.get().blocks.find((block) => block.id === 'done-weekly');
    expect(afterUndo?.doneDates).toEqual([today]);
  });

  it('validates the block form before adding', () => {
    renderCalendar();

    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Bad block' },
    });
    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: '10:00' },
    });
    fireEvent.change(screen.getByLabelText('End'), {
      target: { value: '09:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('alert').textContent).toBe(
      'End time must be after start time.',
    );
    expect(store.get().blocks).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('End'), {
      target: { value: '11:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const created = store.get().blocks[0];
    expect(created?.title).toBe('Bad block');
    expect(created?.source).toBe('personal');
    expect(created?.day).toBe(todayWeekday);
  });

  it('previews import errors and imports only valid rows', () => {
    renderCalendar();

    fireEvent.click(screen.getByRole('button', { name: 'Import timetable' }));
    fireEvent.change(screen.getByLabelText('JSON'), {
      target: {
        value: JSON.stringify([
          { title: 'Imported lecture', day: 'Monday', start: '09:00', end: '10:00' },
          { day: 1, start: '11:00', end: '12:00' },
        ]),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate and preview' }));

    expect(screen.getByText(/1 valid row/)).toBeDefined();
    expect(screen.getByText(/Missing title/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Import 1 block' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 block' }));

    expect(store.get().blocks).toHaveLength(1);
    expect(store.get().blocks[0]?.title).toBe('Imported lecture');
    expect(screen.getByText('Imported 1 block')).toBeDefined();
  });

  it('reports a fatal import error without opening the preview', () => {
    renderCalendar();

    fireEvent.click(screen.getByRole('button', { name: 'Import timetable' }));
    fireEvent.change(screen.getByLabelText('JSON'), {
      target: { value: '{ bad json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate and preview' }));

    expect(screen.getByRole('alert').textContent).toContain('Invalid JSON');
    expect(screen.queryByRole('button', { name: /Import \d+ block/ })).toBeNull();
  });

  it('moves and resizes a focused block with the keyboard', () => {
    store.set((state) => {
      state.blocks.push(
        makeBlock({
          id: 'keyboard-1',
          title: 'OS Lecture',
          day: todayWeekday,
          start: '09:00',
          end: '10:30',
        }),
      );
    });

    renderCalendar();

    const block = screen.getByRole('button', {
      name: 'OS Lecture, 09:00 to 10:30, college',
    });
    block.focus();
    fireEvent.keyDown(block, { key: 'ArrowDown' });

    expect(store.get().blocks[0]?.start).toBe('09:15');
    expect(store.get().blocks[0]?.end).toBe('10:45');
    expect(screen.getByRole('status').textContent).toBe(
      'OS Lecture moved to 09:15 to 10:45',
    );

    const moved = screen.getByRole('button', {
      name: 'OS Lecture, 09:15 to 10:45, college',
    });
    moved.focus();
    fireEvent.keyDown(moved, { key: 'ArrowUp', shiftKey: true });

    expect(store.get().blocks[0]?.end).toBe('10:30');
    expect(screen.getByRole('status').textContent).toBe(
      'OS Lecture resized to 09:15 to 10:30',
    );
    expect(screen.getByRole('button', { name: /OS Lecture, 09:15 to 10:30/ })).toBe(
      document.activeElement,
    );
  });

  it('opens a month day in day view', () => {
    const { container } = renderCalendar();

    fireEvent.keyDown(window, { key: 'm' });
    expect(container.querySelectorAll('.cal-mcell')).toHaveLength(42);

    const cells = container.querySelectorAll<HTMLButtonElement>('.cal-mcell');
    const target = cells[10];
    expect(target).toBeDefined();
    const iso = target?.getAttribute('data-iso');
    fireEvent.click(target as HTMLButtonElement);

    expect(screen.getByRole('radio', { name: 'Day' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    if (iso) {
      expect(container.querySelector(`.cal-col[data-iso="${iso}"]`)).not.toBeNull();
    }
  });
});

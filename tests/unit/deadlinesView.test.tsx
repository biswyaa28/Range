import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeadlinesView, urgency } from '@/features/deadlines/DeadlinesView';
import { ToastProvider } from '@/ui/Toast';
import { store } from '@/store';
import { defaultState } from '@/domain/types';
import { todayISO, addDays } from '@/domain/dates';

function renderDeadlinesView() {
  return render(
    <ToastProvider>
      <DeadlinesView />
    </ToastProvider>,
  );
}

describe('DeadlinesView & urgency logic', () => {
  const T = todayISO();

  beforeEach(() => {
    const clean = defaultState();
    clean.deadlines = [
      {
        id: 'dl-pending-1',
        title: 'Pending Assignment',
        course: 'CS101',
        due: addDays(T, 3),
        type: 'assignment',
        status: 'pending',
        source: 'college-sync',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
        deleted: false,
        deviceId: 'dev1',
      },
      {
        id: 'dl-overdue',
        title: 'Overdue Exam',
        course: 'MATH201',
        due: addDays(T, -2),
        type: 'exam',
        status: 'approved',
        source: 'college-sync',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
        deleted: false,
        deviceId: 'dev1',
      },
      {
        id: 'dl-soon',
        title: 'Due Soon Announcement',
        course: '',
        due: addDays(T, 1),
        type: 'announcement',
        status: 'approved',
        source: 'personal',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
        deleted: false,
        deviceId: 'dev1',
      },
      {
        id: 'dl-week',
        title: 'Next Week Project',
        course: 'PHY101',
        due: addDays(T, 6),
        type: 'assignment',
        status: 'approved',
        source: 'personal',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
        deleted: false,
        deviceId: 'dev1',
      },
      {
        id: 'dl-later',
        title: 'Far Away Project',
        course: 'BIO101',
        due: addDays(T, 14),
        type: 'assignment',
        status: 'approved',
        source: 'personal',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
        deleted: false,
        deviceId: 'dev1',
      },
    ];
    store.importAll(clean);
  });

  it('computes correct urgency classes and labels', () => {
    expect(urgency(addDays(T, -3)).cls).toBe('u-overdue');
    expect(urgency(addDays(T, -3)).label).toBe('Overdue 3d');

    expect(urgency(T).cls).toBe('u-soon');
    expect(urgency(T).label).toBe('Due today');

    expect(urgency(addDays(T, 2)).cls).toBe('u-soon');
    expect(urgency(addDays(T, 2)).label).toBe('2 days left');

    expect(urgency(addDays(T, 5)).cls).toBe('u-week');
    expect(urgency(addDays(T, 10)).cls).toBe('u-later');
  });

  it('approves a pending deadline in Inbox', () => {
    renderDeadlinesView();
    expect(screen.getByText('Pending Assignment')).toBeDefined();

    const approveBtn = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approveBtn);

    const d = store.get().deadlines.find((x) => x.id === 'dl-pending-1');
    expect(d?.status).toBe('approved');
  });

  it('dismisses a pending deadline in Inbox (soft delete)', () => {
    renderDeadlinesView();
    const dismissBtn = screen.getByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissBtn);

    const d = store.get().deadlines.find((x) => x.id === 'dl-pending-1');
    expect(d?.deleted).toBe(true);
  });

  it('toggles deadline done status and displays Done stamp', () => {
    renderDeadlinesView();
    const toggleBtn = screen.getByLabelText('Mark done: Due Soon Announcement');
    fireEvent.click(toggleBtn);

    const d = store.get().deadlines.find((x) => x.id === 'dl-soon');
    expect(d?.status).toBe('done');
  });

  it('soft deletes deadline and supports Undo', () => {
    renderDeadlinesView();
    const delBtn = screen.getByLabelText('Delete: Far Away Project');
    fireEvent.click(delBtn);

    expect(store.get().deadlines.find((x) => x.id === 'dl-later')?.deleted).toBe(true);

    const undoBtn = screen.getByText('Undo');
    fireEvent.click(undoBtn);
    expect(store.get().deadlines.find((x) => x.id === 'dl-later')?.deleted).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TasksView } from '@/features/tasks/TasksView';
import { ToastProvider } from '@/ui/Toast';
import { store } from '@/store';
import { defaultState } from '@/domain/types';
import { todayISO, addDays } from '@/domain/dates';

function renderTasksView() {
  return render(
    <ToastProvider>
      <TasksView />
    </ToastProvider>,
  );
}

describe('TasksView', () => {
  const T = todayISO();

  beforeEach(() => {
    // Reset store to default state
    const clean = defaultState();
    clean.tasks = [
      {
        id: 't-1',
        title: 'Task 1 Pending',
        due: T,
        priority: 'high',
        done: false,
        category: 'work',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
        deleted: false,
        deviceId: 'dev1',
      },
      {
        id: 't-2',
        title: 'Task 2 Overdue',
        due: addDays(T, -2),
        priority: 'med',
        done: false,
        category: 'study',
        createdAt: '2026-11-02T10:00:00Z',
        updatedAt: '2026-11-02T10:00:00Z',
        deleted: false,
        deviceId: 'dev1',
      },
      {
        id: 't-3',
        title: 'Task 3 Done',
        due: T,
        priority: 'low',
        done: true,
        category: '',
        createdAt: '2026-11-03T10:00:00Z',
        updatedAt: '2026-11-03T10:00:00Z',
        deleted: false,
        deviceId: 'dev1',
      },
      {
        id: 't-4',
        title: 'Task 4 Soft Deleted',
        due: T,
        priority: 'med',
        done: false,
        category: '',
        createdAt: '2026-11-04T10:00:00Z',
        updatedAt: '2026-11-04T10:00:00Z',
        deleted: true,
        deviceId: 'dev1',
      },
    ];
    store.importAll(clean);
  });

  it('renders task list and verifies soft-deleted tasks are hidden', () => {
    renderTasksView();

    expect(screen.getByText('Task 1 Pending')).toBeDefined();
    expect(screen.getByText('Task 2 Overdue')).toBeDefined();
    expect(screen.getByText('Task 3 Done')).toBeDefined();
    expect(screen.queryByText('Task 4 Soft Deleted')).toBeNull();
  });

  it('filters tasks by All, Today, Overdue, and Done', () => {
    renderTasksView();

    // Default 'All'
    expect(screen.getByText('Task 1 Pending')).toBeDefined();
    expect(screen.getByText('Task 2 Overdue')).toBeDefined();
    expect(screen.getByText('Task 3 Done')).toBeDefined();

    // Click 'Today'
    fireEvent.click(screen.getByRole('radio', { name: /Today/i }));
    expect(screen.getByText('Task 1 Pending')).toBeDefined();
    expect(screen.queryByText('Task 2 Overdue')).toBeNull();
    expect(screen.queryByText('Task 3 Done')).toBeNull();

    // Click 'Overdue'
    fireEvent.click(screen.getByRole('radio', { name: /Overdue/i }));
    expect(screen.queryByText('Task 1 Pending')).toBeNull();
    expect(screen.getByText('Task 2 Overdue')).toBeDefined();
    expect(screen.queryByText('Task 3 Done')).toBeNull();

    // Click 'Done'
    fireEvent.click(screen.getByRole('radio', { name: /Done/i }));
    expect(screen.queryByText('Task 1 Pending')).toBeNull();
    expect(screen.queryByText('Task 2 Overdue')).toBeNull();
    expect(screen.getByText('Task 3 Done')).toBeDefined();
  });

  it('adds a task via the standard form', () => {
    renderTasksView();

    const titleInput = screen.getByLabelText('Task');
    fireEvent.change(titleInput, { target: { value: 'Buy Groceries' } });

    const priorityChip = screen.getByRole('button', { name: 'High' });
    fireEvent.click(priorityChip);

    const submitBtn = screen.getByRole('button', { name: /ADD$/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText('Buy Groceries')).toBeDefined();
    expect(screen.getByText('Task added')).toBeDefined();
  });

  it('shows live preview chip for quick-add and creates task on submit', () => {
    renderTasksView();

    const quickInput = screen.getByPlaceholderText(/Quick add a task/i);
    fireEvent.change(quickInput, { target: { value: 'Call Mom tomorrow high prio' } });

    // Preview chip should be visible
    expect(screen.getByText('Preview:')).toBeDefined();
    expect(screen.getByText('Call Mom')).toBeDefined();

    fireEvent.submit(quickInput.closest('form')!);

    expect(screen.getByText('Call Mom')).toBeDefined();
    expect(screen.queryByText('Preview:')).toBeNull();
  });

  it('completes/toggles a task', () => {
    renderTasksView();

    const toggleBtn = screen.getByLabelText('Toggle: Task 1 Pending');
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');

    const updatedTask = store.get().tasks.find((t) => t.id === 't-1');
    expect(updatedTask?.done).toBe(true);
  });

  it('deletes a task and allows Undo via toast', () => {
    renderTasksView();

    const deleteBtn = screen.getByLabelText('Delete: Task 1 Pending');
    fireEvent.click(deleteBtn);

    // Confirmation modal should open
    expect(screen.getByText(/Are you sure you want to delete “Task 1 Pending”?/i)).toBeDefined();

    // Confirm delete
    const confirmBtn = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(confirmBtn);

    // Task is removed from list
    expect(screen.queryByText('Task 1 Pending')).toBeNull();

    // Undo toast should appear
    const undoBtn = screen.getByRole('button', { name: 'Undo' });
    expect(undoBtn).toBeDefined();

    // Click Undo
    fireEvent.click(undoBtn);

    // Task is restored
    expect(screen.getByText('Task 1 Pending')).toBeDefined();
    const taskInStore = store.get().tasks.find((t) => t.id === 't-1');
    expect(taskInStore?.deleted).toBe(false);
  });

  it('supports keyboard Space/Enter to toggle and Delete to remove', () => {
    renderTasksView();

    const taskRow = screen.getByRole('listitem', { name: 'Task: Task 1 Pending' });

    // Press Space to toggle
    fireEvent.keyDown(taskRow, { key: ' ' });
    expect(store.get().tasks.find((t) => t.id === 't-1')?.done).toBe(true);

    // Press Delete to trigger delete modal
    fireEvent.keyDown(taskRow, { key: 'Delete' });
    expect(screen.getByText(/Are you sure you want to delete “Task 1 Pending”?/i)).toBeDefined();
  });
});

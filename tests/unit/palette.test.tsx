import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { defaultState, type AppState } from '@/domain/types';
import { todayISO } from '@/domain/dates';
import { store } from '@/store';
import { ToastProvider } from '@/ui/Toast';
import { Palette } from '@/features/palette/Palette';
import { closePalette, openPalette } from '@/features/palette/paletteBus';

function seededState(): AppState {
  const state = defaultState();
  const today = todayISO();
  state.tasks = [
    {
      id: 't-finish',
      title: 'Finish OS assignment write-up',
      due: today,
      priority: 'high',
      done: false,
      category: 'study',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      deleted: false,
      deviceId: 'dev',
    },
  ];
  state.notes = [
    {
      id: 'n-raft',
      title: 'Reading list',
      body: 'Raft consensus notes',
      pinned: false,
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      deleted: false,
      deviceId: 'dev',
    },
  ];
  state.blocks = [
    {
      id: 'b-dsa',
      title: 'DSA lecture',
      day: 1,
      start: '09:00',
      end: '10:00',
      category: 'class',
      done: false,
      doneDates: [],
      source: 'college',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      deleted: false,
      deviceId: 'dev',
    },
  ];
  state.deadlines = [
    {
      id: 'd-os',
      title: 'OS project',
      course: 'CS301',
      due: today,
      type: 'assignment',
      status: 'approved',
      source: 'manual',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      deleted: false,
      deviceId: 'dev',
    },
  ];
  return state;
}

function renderPalette() {
  const onNavigate = vi.fn();
  const onOpenShortcuts = vi.fn();
  const view = render(
    <ToastProvider>
      <Palette onNavigate={onNavigate} onOpenShortcuts={onOpenShortcuts} />
    </ToastProvider>,
  );
  return { ...view, onNavigate, onOpenShortcuts };
}

function open() {
  act(() => openPalette());
  return screen.getByRole('dialog', { name: 'Command palette' });
}

function search(value: string) {
  const input = screen.getByLabelText('Search commands');
  fireEvent.change(input, { target: { value } });
}

describe('Palette', () => {
  beforeEach(() => {
    closePalette();
    store.importAll(seededState());
  });

  afterEach(() => {
    act(() => closePalette());
  });

  it('opens with grouped commands and navigates with arrows and Enter', async () => {
    const { onNavigate } = renderPalette();
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();

    open();
    expect(screen.getAllByText('Navigate').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Create').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Actions').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
    });

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(screen.getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true');
    });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith('plan');
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });

  it('filters commands and runs the highlighted one', async () => {
    const { onNavigate, onOpenShortcuts } = renderPalette();
    open();

    search('home');
    await waitFor(() => {
      expect(screen.getAllByRole('option')[0]?.textContent).toContain('Home');
    });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('home');

    open();
    search('shortcuts');
    fireEvent.click(screen.getByRole('option', { name: /Keyboard shortcuts/ }));
    expect(onOpenShortcuts).toHaveBeenCalled();
  });

  it('shows live tasks, notes, blocks and deadlines and opens them', async () => {
    const { onNavigate } = renderPalette();
    const onEditTask = vi.fn();
    window.addEventListener('personalos:edit-task', onEditTask);
    open();

    search('finish');
    const task = await screen.findByRole('option', { name: /Finish OS assignment/ });
    fireEvent.click(task);
    expect(onNavigate).toHaveBeenCalledWith('tasks');
    await waitFor(() => {
      expect(onEditTask).toHaveBeenCalled();
      expect((onEditTask.mock.calls[0]?.[0] as CustomEvent<string>).detail).toBe('t-finish');
    });

    open();
    search('raft');
    expect(await screen.findByRole('option', { name: /Reading list/ })).toBeDefined();

    search('dsa');
    expect(await screen.findByRole('option', { name: /DSA lecture/ })).toBeDefined();

    search('os project');
    expect(await screen.findByRole('option', { name: /OS project/ })).toBeDefined();

    window.removeEventListener('personalos:edit-task', onEditTask);
  });

  it('records recents and closes on Escape or a second Ctrl/Cmd K', async () => {
    const { onNavigate } = renderPalette();
    open();

    search('home');
    await waitFor(() => {
      expect(screen.getAllByRole('option')[0]?.textContent).toContain('Home');
    });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('home');
    expect(store.get().profile.recentCmds[0]).toBe('go-home');

    open();
    await waitFor(() => {
      expect(screen.getByText('Recent')).toBeDefined();
    });
    expect(screen.getAllByRole('option')[0]?.textContent).toContain('Home');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();

    open();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });

  it('closes when the backdrop is clicked', () => {
    renderPalette();
    const dialog = open();
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });
});

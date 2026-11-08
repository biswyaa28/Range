import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { defaultState, type AppState } from '@/domain/types';
import { todayISO } from '@/domain/dates';
import { store } from '@/store';
import { ToastProvider } from '@/ui/Toast';
import { pomodoro } from '@/engines';
import { FocusMode } from '@/features/focus/FocusMode';
import {
  closeFocusMode,
  isFocusModeOpen,
  openFocusMode,
} from '@/features/focus/focusModeBus';
import { closePalette } from '@/features/palette/paletteBus';

function seededState(): AppState {
  const state = defaultState();
  state.blocks = [
    {
      id: 'b-next',
      title: 'Deep work block',
      day: todayISO(),
      start: '00:00',
      end: '23:59',
      category: 'study',
      done: false,
      doneDates: [],
      source: 'personal',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      deleted: false,
      deviceId: 'dev',
    },
  ];
  return state;
}

function renderOverlay() {
  return render(
    <ToastProvider>
      <FocusMode />
    </ToastProvider>,
  );
}

function open() {
  act(() => openFocusMode());
  return screen.getByRole('dialog', { name: 'Focus mode' });
}

describe('FocusMode', () => {
  beforeEach(() => {
    closePalette();
    closeFocusMode();
    pomodoro.setHoldOnComplete(false);
    pomodoro.reset();
    pomodoro.setDurations(25, 5);
    store.importAll(seededState());
  });

  afterEach(() => {
    act(() => {
      closeFocusMode();
      pomodoro.setHoldOnComplete(false);
      pomodoro.reset();
    });
  });

  it('defaults the session label to the next block and renders the timer', () => {
    renderOverlay();
    open();

    expect((screen.getByLabelText('Session label') as HTMLInputElement).value).toBe(
      'Deep work block',
    );
    expect(document.getElementById('fm-time')?.textContent).toBe('25:00');
    expect(document.getElementById('fm-mode')?.textContent).toBe('Focus');
    expect(
      screen.getByRole('button', { name: 'White' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(screen.getByRole('button', { name: 'Pink' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Brown' })).toBeDefined();
    expect(screen.getByLabelText('Master volume')).toBeDefined();
    expect(screen.getByRole('button', { name: /Sleep · off/ })).toBeDefined();
  });

  it('starts, pauses, skips, adds five minutes and keeps running after Esc', () => {
    renderOverlay();
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(pomodoro.getSnapshot().running).toBe(true);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(pomodoro.getSnapshot().running).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(document.getElementById('fm-mode')?.textContent).toBe('Break');

    fireEvent.click(screen.getByRole('button', { name: '+5 min' }));
    expect(document.getElementById('fm-time')?.textContent).toBe('10:00');

    fireEvent.keyDown(document.body, { key: ' ' });
    expect(pomodoro.getSnapshot().running).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Focus mode' })).toBeNull();
    // Esc only hides the overlay; the timer keeps running.
    expect(pomodoro.getSnapshot().running).toBe(true);
    expect(isFocusModeOpen()).toBe(false);
  });

  it('shows the completion state and starts the suggested next block', () => {
    renderOverlay();
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => {
      pomodoro.tick(Date.now() + 26 * 60_000);
    });

    expect(document.getElementById('fm-done-title')?.textContent).toBe('Session complete');
    const nextBreak = screen.getByRole('button', { name: /Next break · 5 min/ });
    fireEvent.click(nextBreak);

    expect(screen.queryByText('Session complete')).toBeNull();
    expect(pomodoro.getSnapshot()).toMatchObject({ mode: 'break', running: true });
  });

  it('does not toggle the timer with Space while a button is focused', () => {
    renderOverlay();
    open();

    const start = screen.getByRole('button', { name: 'Start' });
    start.focus();
    fireEvent.keyDown(start, { key: ' ' });
    expect(pomodoro.getSnapshot().running).toBe(false);

    fireEvent.keyDown(document.body, { key: ' ' });
    expect(pomodoro.getSnapshot().running).toBe(true);
  });

  it('survives noise controls being clicked without Web Audio', () => {
    renderOverlay();
    open();

    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    expect(
      screen.getByRole('button', { name: 'White' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('restores hold-on-complete when the overlay closes', () => {
    renderOverlay();
    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(isFocusModeOpen()).toBe(false);
    expect(() => pomodoro.setHoldOnComplete(false)).not.toThrow();
  });

  it('mounts nothing while closed', () => {
    renderOverlay();
    expect(screen.queryByRole('dialog', { name: 'Focus mode' })).toBeNull();
  });

  it('ignores completion when the overlay is closed', () => {
    renderOverlay();
    // Start the session without the overlay so no done state can appear.
    act(() => {
      pomodoro.start();
      pomodoro.tick(Date.now() + 26 * 60_000);
    });
    expect(screen.queryByText('Session complete')).toBeNull();
  });
});

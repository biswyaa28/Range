import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { defaultState } from '@/domain/types';
import { store } from '@/store';
import { ToastProvider } from '@/ui/Toast';
import { FocusView } from '@/features/focus/FocusView';
import { pomodoro } from '@/engines';

function renderFocus() {
  return render(
    <ToastProvider>
      <FocusView />
    </ToastProvider>,
  );
}

describe('FocusView pomodoro defaults', () => {
  beforeEach(() => {
    pomodoro.reset();
    pomodoro.setDurations(25, 5);
    store.importAll(defaultState());
  });

  it('keeps the 25/5 default for the pomodoro focus style', () => {
    renderFocus();
    expect(document.getElementById('pomo-work-v')?.textContent).toBe('25');
    expect(document.getElementById('pomo-break-v')?.textContent).toBe('5');
    expect(pomodoro.getSnapshot().remainingMs).toBe(25 * 60_000);
  });

  it('seeds the timer from the profile focus style', () => {
    store.set((state) => {
      state.profile.focusStyle = 'deep';
    });
    renderFocus();

    expect(document.getElementById('pomo-work-v')?.textContent).toBe('50');
    expect(document.getElementById('pomo-break-v')?.textContent).toBe('10');
    expect(pomodoro.getSnapshot()).toMatchObject({
      workMin: 50,
      breakMin: 10,
      remainingMs: 50 * 60_000,
    });
  });

  it('locks the preset baseline in as soon as a duration changes', () => {
    store.set((state) => {
      state.profile.focusStyle = 'deep';
    });
    renderFocus();

    fireEvent.click(screen.getByLabelText('Less break minutes'));
    expect(store.get().settings.pomodoro).toMatchObject({ work: 50, break: 5 });
    expect(document.getElementById('pomo-break-v')?.textContent).toBe('5');

    fireEvent.click(screen.getByLabelText('More work minutes'));
    expect(store.get().settings.pomodoro).toMatchObject({ work: 55, break: 5 });
  });
});

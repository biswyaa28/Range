import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { defaultState } from '@/domain/types';
import { addDays, todayISO } from '@/domain/dates';
import { store } from '@/store';
import { ToastProvider } from '@/ui/Toast';
import { Onboarding } from '@/features/onboarding/Onboarding';

function renderWizard(onClose = vi.fn()) {
  const utils = render(
    <ToastProvider>
      <Onboarding open onClose={onClose} />
    </ToastProvider>,
  );
  return { ...utils, onClose };
}

function click(selector: string): void {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  fireEvent.click(element);
}

function next(): void {
  click('[data-nav="next"]');
}

function choose(step: string, value: string): void {
  click(`[data-k="${step}"][data-v="${value}"]`);
}

describe('Onboarding wizard', () => {
  beforeEach(() => {
    store.importAll(defaultState());
  });

  afterEach(() => {
    cleanup();
  });

  it('persists every answer, creates a real task, and reopens pre-selected', () => {
    const first = renderWizard();

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    choose('greeting', 'hey');
    next();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');

    choose('role', 'School student');
    next();
    fireEvent.change(screen.getByLabelText('Year / level'), {
      target: { value: '2nd year' },
    });
    next();
    fireEvent.change(screen.getByLabelText('Field'), {
      target: { value: 'Computer Science' },
    });
    next();
    fireEvent.change(screen.getByLabelText('Wake time'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByLabelText('Sleep time'), { target: { value: '22:00' } });
    choose('bestTime', 'Morning');
    next();
    fireEvent.change(screen.getByLabelText('Hours per day'), { target: { value: '4' } });
    choose('weeklyGoal', 'Exam prep');
    next();
    choose('focusStyle', 'deep');
    choose('noise', 'pink');
    next();
    click('[data-act="next"]');
    choose('preset', 'minimal');
    next();
    choose('accent', 'blue');
    next();
    fireEvent.change(document.getElementById('onb-task') as HTMLInputElement, {
      target: { value: 'Finish lab report' },
    });
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: 'tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'High' }));
    next();

    expect(screen.getByText('4 h')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open my dashboard' }));

    expect(first.onClose).toHaveBeenCalledTimes(1);

    const state = store.get();
    expect(state.profile).toMatchObject({
      name: 'Ada',
      greeting: 'hey',
      role: 'School student',
      level: '2nd year',
      field: 'Computer Science',
      wake: '08:00',
      sleep: '22:00',
      bestTime: 'Morning',
      studyHours: 4,
      weeklyGoal: 'Exam prep',
      focusStyle: 'deep',
      noise: 'pink',
      preset: 'minimal',
      accent: 'blue',
      onboarded: true,
    });
    expect(state.settings.pomodoro).toEqual({ work: 50, break: 10 });
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({
      title: 'Finish lab report',
      due: addDays(todayISO(), 1),
      priority: 'high',
      done: false,
    });
    expect(state.layout.order[0]).toBe('progress');
    expect(state.layout.hidden).toContain('weekly');
    expect(state.layout.hidden).not.toContain('progress');

    first.unmount();

    renderWizard();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ada');
    expect(
      document
        .querySelector('[data-k="greeting"][data-v="hey"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true');

    next();
    expect(
      document
        .querySelector('[data-k="role"][data-v="School student"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true');
    next();
    expect((screen.getByLabelText('Year / level') as HTMLSelectElement).value).toBe(
      '2nd year',
    );
    next();
    expect((screen.getByLabelText('Field') as HTMLSelectElement).value).toBe(
      'Computer Science',
    );
    next();
    expect((screen.getByLabelText('Wake time') as HTMLSelectElement).value).toBe('08:00');
    expect((screen.getByLabelText('Sleep time') as HTMLSelectElement).value).toBe('22:00');
    expect(
      document
        .querySelector('[data-k="bestTime"][data-v="Morning"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    next();
    expect((screen.getByLabelText('Hours per day') as HTMLSelectElement).value).toBe('4');
    expect(
      document
        .querySelector('[data-k="weeklyGoal"][data-v="Exam prep"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    next();
    expect(
      document
        .querySelector('[data-k="focusStyle"][data-v="deep"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      document
        .querySelector('[data-k="noise"][data-v="pink"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    next();
    click('[data-act="next"]');
    expect(
      document
        .querySelector('[data-k="preset"][data-v="minimal"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true');
    next();
    expect(
      document
        .querySelector('[data-k="accent"][data-v="blue"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('marks a first run onboarded when skipped or escaped', () => {
    const skipped = renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(store.get().profile.onboarded).toBe(true);
    expect(skipped.onClose).toHaveBeenCalledTimes(1);
    skipped.unmount();

    store.importAll(defaultState());
    const escaped = renderWizard();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(store.get().profile.onboarded).toBe(true);
    expect(escaped.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes without changing the profile when re-opened from Settings', () => {
    store.set((state) => {
      state.profile.name = 'Ada';
      state.profile.onboarded = true;
    });
    const reopened = renderWizard();

    expect(screen.getByRole('button', { name: 'Close' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(reopened.onClose).toHaveBeenCalledTimes(1);
    expect(store.get().profile.name).toBe('Ada');
    expect(store.get().profile.onboarded).toBe(true);
  });

  it('never injects fake data when finishing with an empty task', () => {
    renderWizard();

    for (let step = 0; step < 11; step++) {
      next();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Open my dashboard' }));

    const state = store.get();
    expect(state.profile.onboarded).toBe(true);
    expect(state.tasks).toHaveLength(0);
    expect(state.blocks).toHaveLength(0);
    expect(state.notes).toHaveLength(0);
    expect(state.deadlines).toHaveLength(0);
  });

  it('goes back without advancing the saved step count', () => {
    renderWizard();
    next();
    next();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3');
    click('[data-nav="back"]');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { defaultState } from '@/domain/types';
import { defaultSettings, patchSettings } from '@/domain/settings';
import { aiKeyStore, store, settingsStore } from '@/store';
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

function choose(group: string, value: string): void {
  click(`[data-k="${group}"][data-v="${value}"]`);
}

function change(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function progress(): string | null {
  return screen.getByRole('progressbar').getAttribute('aria-valuenow');
}

describe('Onboarding wizard', () => {
  beforeEach(async () => {
    store.importAll(defaultState());
    settingsStore.reset();
    await aiKeyStore.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('saves every answer into Settings and mirrors the legacy groups', async () => {
    const wizard = renderWizard();

    expect(progress()).toBe('1');
    change('Your name', 'Ada');
    choose('role', 'work');
    next();
    expect(progress()).toBe('2');

    choose('goal', 'assignments');
    choose('goal', 'exams');
    next();

    change('Wake up', '08:00');
    change('Sleep', '22:30');
    change('Peak focus starts', '09:30');
    change('Peak focus ends', '12:30');
    next();

    choose('timetable', 'later');
    next();

    choose('theme', 'dark');
    choose('accent', 'blue');
    next();

    expect(
      document.querySelector('[data-k="widget"][data-v="weekly"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    click('[data-k="widget"][data-v="weekly"]');
    next();

    choose('focusStyle', 'deep');
    choose('noise', 'pink');
    next();

    change('API key (optional)', 'AIza-test-key-123456');
    click('[role="switch"][aria-label="Let AI read your notes"]');
    next();

    expect(screen.getByText('Ada')).not.toBeNull();
    expect(screen.getByText('Working professional')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));

    expect(wizard.onClose).toHaveBeenCalledTimes(1);

    const saved = settingsStore.get();
    expect(saved.identity).toEqual({
      name: 'Ada',
      role: 'work',
      goals: ['assignments', 'exams'],
    });
    expect(saved.rhythm).toEqual({
      wake: '08:00',
      sleep: '22:30',
      peakStart: '09:30',
      peakEnd: '12:30',
    });
    expect(saved.onboarding).toMatchObject({ completed: true, timetable: 'later' });
    expect(saved.theme).toBe('dark');
    expect(saved.accentColor).toBe('blue');
    expect(saved.focus).toEqual({
      style: 'deep',
      noise: 'pink',
      workMinutes: 50,
      breakMinutes: 10,
    });
    expect(saved.ai).toEqual({
      canReadNotes: true,
      enabled: true,
      provider: 'gemini',
    });
    expect(saved.ai).not.toHaveProperty('apiKey');
    await waitFor(() => expect(aiKeyStore.getKey()).toBe('AIza-test-key-123456'));
    expect(saved.homeWidgets.visible.weekly).toBe(false);
    expect(saved.homeWidgets.visible.progress).toBe(true);

    const state = store.get();
    expect(state.profile).toMatchObject({
      name: 'Ada',
      role: 'Working professional',
      wake: '08:00',
      sleep: '22:30',
      bestTime: 'Morning',
      focusStyle: 'deep',
      noise: 'pink',
      accent: 'blue',
      onboarded: true,
    });
    expect(state.settings.theme).toBe('dark');
    expect(state.settings.pomodoro).toEqual({ work: 50, break: 10 });
    expect(state.layout.hidden).toContain('weekly');
    expect(state.layout.hidden).not.toContain('progress');
  });

  it('reopens with saved answers pre-selected', () => {
    settingsStore.replace(
      patchSettings(defaultSettings(), {
        identity: { name: 'Grace', role: 'other', goals: ['skills', 'balance'] },
        rhythm: {
          wake: '06:30',
          sleep: '23:30',
          peakStart: '20:00',
          peakEnd: '23:00',
        },
        theme: 'light',
        accentColor: 'violet',
        onboarding: { completed: true, timetable: 'manual' },
      }),
    );
    store.set((state) => {
      state.profile.onboarded = true;
    });

    renderWizard();

    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Grace');
    expect(
      document.querySelector('[data-k="role"][data-v="other"]')?.getAttribute('aria-checked'),
    ).toBe('true');

    next();
    expect(
      document.querySelector('[data-k="goal"][data-v="skills"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      document.querySelector('[data-k="goal"][data-v="balance"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    next();

    expect((screen.getByLabelText('Wake up') as HTMLInputElement).value).toBe('06:30');
    expect((screen.getByLabelText('Peak focus ends') as HTMLInputElement).value).toBe('23:00');
    next();

    expect(
      document
        .querySelector('[data-k="timetable"][data-v="manual"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true');
    next();

    expect(
      document.querySelector('[data-k="theme"][data-v="light"]')?.getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      document
        .querySelector('[data-k="accent"][data-v="violet"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('validates each form step before advancing', () => {
    renderWizard();

    next();
    expect(progress()).toBe('1');
    expect(screen.getByRole('alert').textContent).toContain('Enter a name');

    change('Your name', 'Ada');
    expect(screen.queryByRole('alert')).toBeNull();
    next();
    expect(progress()).toBe('2');

    next();
    expect(progress()).toBe('2');
    expect(screen.getByRole('alert').textContent).toContain('Pick at least one goal');

    choose('goal', 'projects');
    next();
    expect(progress()).toBe('3');
    change('Peak focus ends', '08:00');
    next();
    expect(progress()).toBe('3');
    expect(screen.getByRole('alert').textContent).toContain('end after it starts');

    change('Peak focus ends', '10:00');
    next();
    expect(progress()).toBe('4');
  });

  it('refuses to hide the last Home card and validates a partial AI key', () => {
    renderWizard();
    change('Your name', 'Ada');
    next();
    for (let step = 0; step < 4; step++) click('[data-nav="skip"]');
    expect(progress()).toBe('6');

    for (const card of Array.from(
      document.querySelectorAll<HTMLElement>('[data-k="widget"]'),
    )) {
      fireEvent.click(card);
    }
    expect(screen.getByRole('alert').textContent).toContain('at least one card');
    next();
    expect(progress()).toBe('7');

    next();
    expect(progress()).toBe('8');
    change('API key (optional)', 'sk-1');
    next();
    expect(progress()).toBe('8');
    expect(screen.getByRole('alert').textContent).toContain('incomplete');
  });

  it('previews the draft theme only while the appearance step is open', () => {
    settingsStore.replace(patchSettings(defaultSettings(), { theme: 'light' }));
    renderWizard();

    for (let step = 0; step < 4; step++) click('[data-nav="skip"]');
    expect(progress()).toBe('5');
    expect(document.documentElement.dataset.theme).toBe('light');

    choose('theme', 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    next();
    expect(progress()).toBe('6');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('marks a first run onboarded when skipped or escaped', () => {
    const skipped = renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(store.get().profile.onboarded).toBe(true);
    expect(skipped.onClose).toHaveBeenCalledTimes(1);
    expect(settingsStore.get().onboarding.completed).toBe(false);
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
    expect(settingsStore.get().onboarding.completed).toBe(false);
  });

  it('never injects data and can save defaults after skipping', () => {
    renderWizard();

    for (let step = 0; step < 8; step++) {
      click('[data-nav="skip"]');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));

    const state = store.get();
    expect(state.profile.onboarded).toBe(true);
    expect(state.tasks).toHaveLength(0);
    expect(state.blocks).toHaveLength(0);
    expect(state.notes).toHaveLength(0);
    expect(state.deadlines).toHaveLength(0);

    const saved = settingsStore.get();
    expect(saved.onboarding.completed).toBe(true);
    expect(saved.focus).toEqual({
      style: 'pomodoro',
      noise: 'none',
      workMinutes: 25,
      breakMinutes: 5,
    });
    expect(saved.homeWidgets.order).toHaveLength(12);
  });

  it('goes back without advancing the saved step count', () => {
    renderWizard();
    change('Your name', 'Ada');
    next();
    choose('goal', 'projects');
    next();
    expect(progress()).toBe('3');
    click('[data-nav="back"]');
    expect(progress()).toBe('2');
  });
});

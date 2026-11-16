import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  focusDurations,
  goalLabel,
  onboardingDraft,
  onboardingSave,
  onboardingStep,
  onboardingStepIndex,
  peakLabel,
  providerForKey,
  roleProfileLabel,
  validateOnboardingStep,
} from '@/domain/onboarding';
import type { OnboardingDraft } from '@/domain/onboarding';
import { defaultSettings, patchSettings } from '@/domain/settings';

function draft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return { ...onboardingDraft(defaultSettings()), ...overrides };
}

describe('onboarding domain helpers', () => {
  it('exposes nine ordered steps', () => {
    expect(ONBOARDING_STEP_COUNT).toBe(9);
    expect(ONBOARDING_STEPS.map((step) => step.id)).toEqual([
      'identity',
      'goals',
      'rhythm',
      'timetable',
      'appearance',
      'widgets',
      'focus',
      'ai',
      'summary',
    ]);
    expect(new Set(ONBOARDING_STEPS.map((step) => step.label)).size).toBe(9);
  });

  it('clamps step lookups and finds step indexes', () => {
    expect(onboardingStep(-4).id).toBe('identity');
    expect(onboardingStep(2).id).toBe('rhythm');
    expect(onboardingStep(99).id).toBe('summary');
    expect(onboardingStepIndex('appearance')).toBe(4);
    expect(onboardingStepIndex('summary')).toBe(8);
  });

  it('hydrates the draft from saved settings', () => {
    const settings = patchSettings(defaultSettings(), {
      identity: { name: 'Ada', role: 'work', goals: ['exams', 'skills'] },
      rhythm: { wake: '06:00', sleep: '22:00', peakStart: '08:00', peakEnd: '11:00' },
      theme: 'dark',
      accentColor: 'teal',
      onboarding: { completed: true, timetable: 'upload' },
      focus: { style: 'long', noise: 'brown' },
      ai: { canReadNotes: true },
    });

    const hydrated = onboardingDraft(settings);
    expect(hydrated).toMatchObject({
      name: 'Ada',
      role: 'work',
      goals: ['exams', 'skills'],
      wake: '06:00',
      sleep: '22:00',
      peakStart: '08:00',
      peakEnd: '11:00',
      timetable: 'upload',
      theme: 'dark',
      accentColor: 'teal',
      focusStyle: 'long',
      noise: 'brown',
      aiApiKey: '',
      aiCanReadNotes: true,
    });
    expect(hydrated.widgets).toHaveLength(12);
  });

  it('validates required fields per step', () => {
    expect(validateOnboardingStep('identity', draft({ name: '  ' }))).toContain('Enter a name');
    expect(validateOnboardingStep('identity', draft({ name: 'Ada' }))).toBeNull();

    expect(validateOnboardingStep('goals', draft())).toContain('at least one goal');
    expect(validateOnboardingStep('goals', draft({ goals: ['balance'] }))).toBeNull();

    expect(validateOnboardingStep('rhythm', draft({ wake: '7:00' }))).toContain(
      'valid wake-up',
    );
    expect(validateOnboardingStep('rhythm', draft({ wake: '07:00', sleep: '07:00' }))).toContain(
      'different',
    );
    expect(
      validateOnboardingStep('rhythm', draft({ peakStart: '15:00', peakEnd: '14:00' })),
    ).toContain('end after it starts');
    expect(validateOnboardingStep('rhythm', draft())).toBeNull();

    expect(validateOnboardingStep('widgets', draft({ widgets: [] }))).toContain('at least one');
    expect(validateOnboardingStep('widgets', draft())).toBeNull();

    expect(validateOnboardingStep('ai', draft({ aiApiKey: 'sk-1' }))).toContain('incomplete');
    expect(validateOnboardingStep('ai', draft({ aiApiKey: 'sk-ant-12345678' }))).toBeNull();
    expect(validateOnboardingStep('ai', draft({ aiApiKey: '   ' }))).toBeNull();

    expect(validateOnboardingStep('timetable', draft())).toBeNull();
    expect(validateOnboardingStep('appearance', draft())).toBeNull();
    expect(validateOnboardingStep('summary', draft())).toBeNull();
  });

  it('builds the full settings patch and legacy mirror', () => {
    const saved = defaultSettings();
    const save = onboardingSave(
      draft({
        name: '  Ada  ',
        role: 'work',
        goals: ['projects'],
        wake: '08:00',
        sleep: '22:00',
        peakStart: '18:00',
        peakEnd: '21:00',
        timetable: 'manual',
        theme: 'dark',
        accentColor: 'violet',
        accentCustom: '#123456',
        widgets: ['progress', 'focus'],
        focusStyle: 'deep',
        noise: 'pink',
        aiApiKey: ' sk-ant-test-123456 ',
        aiCanReadNotes: true,
      }),
      saved,
    );

    expect(save.settings.identity).toEqual({
      name: 'Ada',
      role: 'work',
      goals: ['projects'],
    });
    expect(save.settings.rhythm).toEqual({
      wake: '08:00',
      sleep: '22:00',
      peakStart: '18:00',
      peakEnd: '21:00',
    });
    expect(save.settings.focus).toEqual({
      style: 'deep',
      noise: 'pink',
      workMinutes: 50,
      breakMinutes: 10,
    });
    expect(save.settings.onboarding).toEqual({ completed: true, timetable: 'manual' });
    expect(save.settings.theme).toBe('dark');
    expect(save.settings.accentColor).toBe('violet');
    expect(save.settings.accentCustom).toBe('#123456');
    expect(save.settings.ai).toEqual({
      canReadNotes: true,
      enabled: true,
      provider: 'gemini',
    });
    // The key travels beside the settings patch, never inside it.
    expect(save.aiKey).toBe('sk-ant-test-123456');
    expect(save.settings.ai).not.toHaveProperty('apiKey');
    expect(save.settings.homeWidgets?.visible?.['progress']).toBe(true);
    expect(save.settings.homeWidgets?.visible?.['weekly']).toBe(false);

    expect(save.profile).toMatchObject({
      name: 'Ada',
      role: 'Working professional',
      wake: '08:00',
      sleep: '22:00',
      bestTime: 'Evening',
      focusStyle: 'deep',
      noise: 'pink',
      accent: 'violet',
      customAccent: '#123456',
      onboarded: true,
    });
    expect(save.pomodoro).toEqual({ work: 50, break: 10 });
    expect(save.layout.hidden).toContain('weekly');
    expect(save.layout.hidden).not.toContain('progress');
    expect(save.legacyTheme).toBe('dark');
  });

  it('keeps custom focus durations when the style is unchanged', () => {
    const saved = patchSettings(defaultSettings(), {
      focus: { workMinutes: 33, breakMinutes: 7 },
    });
    const same = onboardingSave(draft({ focusStyle: 'pomodoro' }), saved);
    expect(same.settings.focus).toMatchObject({ workMinutes: 33, breakMinutes: 7 });
    expect(same.pomodoro).toEqual({ work: 33, break: 7 });

    const changed = onboardingSave(draft({ focusStyle: 'long' }), saved);
    expect(changed.settings.focus).toMatchObject({ workMinutes: 90, breakMinutes: 20 });
    expect(changed.pomodoro).toEqual({ work: 90, break: 20 });
  });

  it('falls back to local AI and drops malformed values', () => {
    const save = onboardingSave(
      draft({
        role: 'student',
        wake: 'nope',
        sleep: '25:00',
        peakStart: '99:99',
        peakEnd: '00:00',
        aiApiKey: 'bad key',
        aiCanReadNotes: false,
      }),
      defaultSettings(),
    );

    expect(save.settings.ai).toMatchObject({ enabled: false, provider: 'gemini' });
    expect(save.aiKey).toBe('');
    expect(save.settings.rhythm).toEqual({
      wake: '07:00',
      sleep: '23:00',
      peakStart: '09:00',
      peakEnd: '12:00',
    });
    expect(save.settings.identity?.role).toBe('student');
    expect(save.legacyTheme).toBe('auto');
  });

  it('maps keys, focus styles, roles and peak windows', () => {
    expect(providerForKey('gsk_abc')).toBe('groq');
    expect(providerForKey('sk-or-abc')).toBe('openrouter');
    expect(providerForKey('AIzaSyAbc')).toBe('gemini');
    expect(providerForKey('')).toBe('gemini');

    expect(focusDurations('pomodoro')).toEqual([25, 5]);
    expect(focusDurations('deep')).toEqual([50, 10]);
    expect(focusDurations('long')).toEqual([90, 20]);

    expect(roleProfileLabel('student')).toBe('Student');
    expect(roleProfileLabel('work')).toBe('Working professional');
    expect(roleProfileLabel('other')).toBe('Other');
    expect(goalLabel('exams')).toBe('Exams');

    expect(peakLabel('06:00')).toBe('Morning');
    expect(peakLabel('12:00')).toBe('Afternoon');
    expect(peakLabel('17:00')).toBe('Evening');
    expect(peakLabel('21:30')).toBe('Late night');
    expect(peakLabel('bad')).toBe('Morning');
  });
});

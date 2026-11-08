import { describe, it, expect } from 'vitest';
import { FixedClock } from '@/domain/dates';
import { ONBOARDING_STEP_COUNT, onboardingTaskDue } from '@/domain/onboarding';

describe('onboarding domain helpers', () => {
  const monday = new FixedClock('2026-04-13T10:00:00.000Z');

  it('exposes the 12 legacy steps', () => {
    expect(ONBOARDING_STEP_COUNT).toBe(12);
  });

  it('maps due chips to real dates', () => {
    expect(onboardingTaskDue('today', monday)).toBe('2026-04-13');
    expect(onboardingTaskDue('tomorrow', monday)).toBe('2026-04-14');
    expect(onboardingTaskDue('week', monday)).toBe('2026-04-19');
    expect(onboardingTaskDue('none', monday)).toBeNull();
  });

  it('maps "this week" to today when the week is already over on Sunday', () => {
    const sunday = new FixedClock('2026-04-19T10:00:00.000Z');
    expect(onboardingTaskDue('week', sunday)).toBe('2026-04-19');
  });

  it('handles month boundaries through the date helper', () => {
    const endOfMonth = new FixedClock('2026-04-30T10:00:00.000Z');
    expect(onboardingTaskDue('tomorrow', endOfMonth)).toBe('2026-05-01');
  });
});

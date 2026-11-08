import type { Clock } from './dates';
import { addDays, defaultClock, mondayIndex } from './dates';

export type OnboardingTaskDue = 'today' | 'tomorrow' | 'week' | 'none';

export const ONBOARDING_STEP_COUNT = 12;

/**
 * Resolves the first-task due chip into a real ISO date. "This week" means
 * the coming Sunday, matching the legacy onboarding mapping.
 */
export function onboardingTaskDue(
  due: OnboardingTaskDue,
  clock: Clock = defaultClock,
): string | null {
  const today = clock.todayISO();
  if (due === 'today') return today;
  if (due === 'tomorrow') return addDays(today, 1);
  if (due === 'week') return addDays(today, 6 - mondayIndex(clock.now(), clock));
  return null;
}

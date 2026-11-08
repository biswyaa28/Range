/**
 * Focus-style presets. These mirror the onboarding choices in the legacy app:
 * the profile stores a style, and the Pomodoro timer should start from the
 * matching work/break pair unless the user has customised the durations.
 */

export interface FocusDurations {
  work: number;
  break: number;
}

/** Work/break minutes for each onboarding focus style. */
export const FOCUS_MIN: Record<string, readonly [number, number]> = {
  pomodoro: [25, 5],
  deep: [50, 10],
  long: [90, 20],
};

/** Schema defaults for `settings.pomodoro`; matching values mean "untouched". */
export const DEFAULT_FOCUS_DURATIONS: FocusDurations = { work: 25, break: 5 };

/**
 * Resolves the durations the timer should use right now. A profile focus
 * style seeds the timer only while the saved settings still hold the schema
 * defaults, so any explicit stepper edit keeps winning afterwards.
 */
export function effectivePomodoroDurations(
  focusStyle: string,
  saved: FocusDurations,
): FocusDurations {
  const untouched =
    saved.work === DEFAULT_FOCUS_DURATIONS.work &&
    saved.break === DEFAULT_FOCUS_DURATIONS.break;
  if (!untouched) return { work: saved.work, break: saved.break };
  const preset = FOCUS_MIN[focusStyle];
  if (!preset) return { work: saved.work, break: saved.break };
  return { work: preset[0], break: preset[1] };
}

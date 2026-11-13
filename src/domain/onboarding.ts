import type { Profile } from './types';
import type {
  AccentColor,
  AIProvider,
  FocusStyle,
  GoalId,
  NoisePreference,
  OnboardingRole,
  Settings,
  SettingsPatch,
  ThemePreference,
  TimetableSource,
} from './settings';
import { DEFAULT_HOME_WIDGET_ORDER } from './settings';
import { FOCUS_MIN } from './focusPresets';

/**
 * First-run setup. The wizard edits a draft, validates it one step at a time
 * and only writes to the versioned Settings store when the last step is done.
 */

export const ONBOARDING_STEP_COUNT = 9;

export type OnboardingStepId =
  | 'identity'
  | 'goals'
  | 'rhythm'
  | 'timetable'
  | 'appearance'
  | 'widgets'
  | 'focus'
  | 'ai'
  | 'summary';

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  title: string;
  subtitle: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'identity',
    label: 'You',
    title: 'What should I call you?',
    subtitle: 'A name for your greeting, plus how you spend your days.',
  },
  {
    id: 'goals',
    label: 'Goals',
    title: 'What are you working toward?',
    subtitle: 'Pick everything that matters. You can change this later.',
  },
  {
    id: 'rhythm',
    label: 'Rhythm',
    title: 'When does your day run?',
    subtitle: 'We fit blocks and focus sessions around your natural hours.',
  },
  {
    id: 'timetable',
    label: 'Timetable',
    title: 'Bring in your college timetable',
    subtitle: 'Upload a file, add blocks by hand, or do it later. It stays on this device.',
  },
  {
    id: 'appearance',
    label: 'Look',
    title: 'Make it yours',
    subtitle: 'Pick a look. Everything updates live as you choose.',
  },
  {
    id: 'widgets',
    label: 'Home',
    title: 'What belongs on Home?',
    subtitle: 'Choose the cards you want to see first. You can reorder them later.',
  },
  {
    id: 'focus',
    label: 'Focus',
    title: 'Set your focus defaults',
    subtitle: 'How long do you like to work, and what helps you concentrate?',
  },
  {
    id: 'ai',
    label: 'AI',
    title: 'Optional: connect AI',
    subtitle: 'Add a key to enable suggestions, or leave it blank to stay fully local.',
  },
  {
    id: 'summary',
    label: 'Done',
    title: 'You’re all set',
    subtitle: 'Here’s what we’ll save to your settings.',
  },
];

const EMPTY_DRAFT_FALLBACK: OnboardingDraft = {
  name: '',
  role: 'student',
  goals: [],
  wake: '07:00',
  sleep: '23:00',
  peakStart: '09:00',
  peakEnd: '12:00',
  timetable: 'later',
  theme: 'system',
  accentColor: 'mono',
  accentCustom: '#8B7BFF',
  widgets: [...DEFAULT_HOME_WIDGET_ORDER],
  focusStyle: 'pomodoro',
  noise: 'none',
  aiApiKey: '',
  aiCanReadNotes: false,
};

export interface OnboardingDraft {
  name: string;
  role: OnboardingRole;
  goals: GoalId[];
  wake: string;
  sleep: string;
  peakStart: string;
  peakEnd: string;
  timetable: TimetableSource;
  theme: ThemePreference;
  accentColor: AccentColor;
  accentCustom: string;
  /** Home cards that stay visible, in the user's saved order. */
  widgets: string[];
  focusStyle: FocusStyle;
  noise: NoisePreference;
  aiApiKey: string;
  aiCanReadNotes: boolean;
}

export interface OnboardingOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export const ROLE_OPTIONS: readonly OnboardingOption<OnboardingRole>[] = [
  { value: 'student', label: 'Student', hint: 'School or college' },
  { value: 'work', label: 'Work', hint: 'Job or professional' },
  { value: 'other', label: 'Other', hint: 'Something else' },
];

export const GOAL_OPTIONS: readonly OnboardingOption<GoalId>[] = [
  { value: 'assignments', label: 'Assignments' },
  { value: 'exams', label: 'Exams' },
  { value: 'projects', label: 'Projects' },
  { value: 'skills', label: 'Skills' },
  { value: 'consistency', label: 'Consistency' },
  { value: 'balance', label: 'Balance' },
];

export const TIMETABLE_OPTIONS: readonly OnboardingOption<TimetableSource>[] = [
  { value: 'upload', label: 'Upload a file', hint: 'CSV or JSON export' },
  { value: 'manual', label: 'Add manually', hint: 'Create blocks one by one' },
  { value: 'later', label: 'Later', hint: 'Start with a clean week' },
];

export const THEME_OPTIONS: readonly OnboardingOption<ThemePreference>[] = [
  { value: 'light', label: 'Light', hint: 'Bright surfaces' },
  { value: 'dark', label: 'Dark', hint: 'Easy on the eyes' },
  { value: 'system', label: 'Auto', hint: 'Match this device' },
];

export function focusStyleOptions(): Array<OnboardingOption<FocusStyle>> {
  return [
    { value: 'pomodoro', label: 'Pomodoro', hint: focusHint('pomodoro') },
    { value: 'deep', label: 'Deep work', hint: focusHint('deep') },
    { value: 'long', label: 'Long focus', hint: focusHint('long') },
  ];
}

export const NOISE_OPTIONS: readonly OnboardingOption<NoisePreference>[] = [
  { value: 'none', label: 'None' },
  { value: 'white', label: 'White' },
  { value: 'pink', label: 'Pink' },
  { value: 'brown', label: 'Brown' },
];

const ROLE_PROFILE_LABELS: Readonly<Record<OnboardingRole, string>> = {
  student: 'Student',
  work: 'Working professional',
  other: 'Other',
};

export function roleProfileLabel(role: OnboardingRole): string {
  return ROLE_PROFILE_LABELS[role];
}

export function goalLabel(goal: GoalId): string {
  return GOAL_OPTIONS.find((option) => option.value === goal)?.label ?? goal;
}

/** Work/break minutes for a focus style, always defined. */
export function focusDurations(style: FocusStyle): readonly [number, number] {
  return FOCUS_MIN[style] ?? FOCUS_MIN['pomodoro'] ?? ([25, 5] as const);
}

export function focusHint(style: FocusStyle): string {
  const [work, rest] = focusDurations(style);
  return `${work} / ${rest} min`;
}

function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(ONBOARDING_STEP_COUNT - 1, Math.round(step)));
}

export function onboardingStep(step: number): OnboardingStep {
  return ONBOARDING_STEPS[clampStep(step)] ?? ONBOARDING_STEPS[0]!;
}

export function onboardingStepIndex(id: OnboardingStepId): number {
  const index = ONBOARDING_STEPS.findIndex((step) => step.id === id);
  return index < 0 ? 0 : index;
}

/** Seeds the draft from saved settings so reopening setup shows current values. */
export function onboardingDraft(settings: Settings): OnboardingDraft {
  const savedWidgets = settings.homeWidgets.order.filter(
    (id) => settings.homeWidgets.visible[id] !== false,
  );
  const widgets = DEFAULT_HOME_WIDGET_ORDER.filter((id) => savedWidgets.includes(id));
  for (const id of savedWidgets) {
    if (!widgets.includes(id)) widgets.push(id);
  }

  return {
    name: settings.identity.name,
    role: settings.identity.role,
    goals: [...settings.identity.goals],
    wake: settings.rhythm.wake,
    sleep: settings.rhythm.sleep,
    peakStart: settings.rhythm.peakStart,
    peakEnd: settings.rhythm.peakEnd,
    timetable: settings.onboarding.timetable ?? 'later',
    theme: settings.theme,
    accentColor: settings.accentColor,
    accentCustom: settings.accentCustom,
    widgets: widgets.length > 0 ? widgets : [...EMPTY_DRAFT_FALLBACK.widgets],
    focusStyle: settings.focus.style,
    noise: settings.focus.noise,
    // The key lives in secure storage, never in the settings snapshot.
    aiApiKey: '',
    aiCanReadNotes: settings.ai.canReadNotes,
  };
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutesOfDay(value: string): number {
  const [hours, minutes] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function isUsableKey(key: string): boolean {
  return key.length === 0 || (!/\s/.test(key) && key.length >= 8);
}

/** Returns a human error for the step, or null when it can advance. */
export function validateOnboardingStep(
  id: OnboardingStepId,
  draft: OnboardingDraft,
): string | null {
  switch (id) {
    case 'identity':
      return draft.name.trim().length > 0
        ? null
        : 'Enter a name so the app knows what to call you.';
    case 'goals':
      return draft.goals.length > 0 ? null : 'Pick at least one goal.';
    case 'rhythm': {
      if (!TIME_OF_DAY.test(draft.wake)) return 'Enter a valid wake-up time.';
      if (!TIME_OF_DAY.test(draft.sleep)) return 'Enter a valid bedtime.';
      if (draft.wake === draft.sleep) {
        return 'Wake and sleep times need to be different.';
      }
      if (!TIME_OF_DAY.test(draft.peakStart) || !TIME_OF_DAY.test(draft.peakEnd)) {
        return 'Enter valid peak focus hours.';
      }
      if (minutesOfDay(draft.peakEnd) <= minutesOfDay(draft.peakStart)) {
        return 'Peak focus needs to end after it starts.';
      }
      return null;
    }
    case 'widgets':
      return draft.widgets.length > 0 ? null : 'Keep at least one card on Home.';
    case 'ai': {
      const key = draft.aiApiKey.trim();
      if (isUsableKey(key)) return null;
      return 'That key looks incomplete. Paste the full key or leave it blank.';
    }
    default:
      return null;
  }
}

/** Guards a draft that skipped steps or came from older data. */
function safeDraft(draft: OnboardingDraft): OnboardingDraft {
  const wake = TIME_OF_DAY.test(draft.wake) ? draft.wake : EMPTY_DRAFT_FALLBACK.wake;
  const sleep = TIME_OF_DAY.test(draft.sleep) ? draft.sleep : EMPTY_DRAFT_FALLBACK.sleep;
  const peakStart = TIME_OF_DAY.test(draft.peakStart)
    ? draft.peakStart
    : EMPTY_DRAFT_FALLBACK.peakStart;
  const rawPeakEnd = TIME_OF_DAY.test(draft.peakEnd)
    ? draft.peakEnd
    : EMPTY_DRAFT_FALLBACK.peakEnd;
  const peakEnd =
    minutesOfDay(rawPeakEnd) > minutesOfDay(peakStart)
      ? rawPeakEnd
      : EMPTY_DRAFT_FALLBACK.peakEnd;
  const aiKey = draft.aiApiKey.trim().slice(0, 256);

  return {
    ...EMPTY_DRAFT_FALLBACK,
    ...draft,
    name: draft.name.trim().slice(0, 40),
    goals: draft.goals.filter((goal) => GOAL_OPTIONS.some((option) => option.value === goal)),
    widgets:
      draft.widgets.length > 0
        ? draft.widgets.filter((id) => DEFAULT_HOME_WIDGET_ORDER.includes(id))
        : [],
    timetable: draft.timetable ?? 'later',
    wake,
    sleep,
    peakStart,
    peakEnd,
    aiApiKey: isUsableKey(aiKey) ? aiKey : '',
  };
}

export function providerForKey(key: string): AIProvider {
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('sk-or-')) return 'openrouter';
  return 'gemini';
}

/** Legacy Home and Calendar read one of four named focus windows. */
export function peakLabel(start: string): string {
  if (!TIME_OF_DAY.test(start)) return 'Morning';
  const hour = Number(start.slice(0, 2));
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 21) return 'Evening';
  return 'Late night';
}

export interface OnboardingSave {
  /** Written to the versioned Settings store. */
  settings: SettingsPatch;
  /** Written to the platform secure store, never to Settings. */
  aiKey: string;
  /** Mirrored into the legacy profile so older surfaces keep working. */
  profile: Partial<Profile>;
  pomodoro: { work: number; break: number };
  layout: { order: string[]; hidden: string[] };
  legacyTheme: 'auto' | 'light' | 'dark';
}

/** Builds the complete write for the final step. Pure and testable. */
export function onboardingSave(
  draft: OnboardingDraft,
  settings: Settings,
): OnboardingSave {
  const safe = safeDraft(draft);
  const [presetWork, presetRest] = focusDurations(safe.focusStyle);
  // Keep custom durations when the style did not change; a new style reseeds them.
  const keepDurations = safe.focusStyle === settings.focus.style;
  const work = keepDurations ? settings.focus.workMinutes : presetWork;
  const rest = keepDurations ? settings.focus.breakMinutes : presetRest;
  const aiKey = safe.aiApiKey;
  const order = [...settings.homeWidgets.order];
  const visible: Record<string, boolean> = {};
  for (const id of DEFAULT_HOME_WIDGET_ORDER) {
    visible[id] = safe.widgets.includes(id);
  }

  return {
    settings: {
      identity: { name: safe.name, role: safe.role, goals: [...safe.goals] },
      rhythm: {
        wake: safe.wake,
        sleep: safe.sleep,
        peakStart: safe.peakStart,
        peakEnd: safe.peakEnd,
      },
      focus: {
        style: safe.focusStyle,
        noise: safe.noise,
        workMinutes: work,
        breakMinutes: rest,
        // The Settings page can still override durations after setup.
      },
      onboarding: { completed: true, timetable: safe.timetable },
      theme: safe.theme,
      accentColor: safe.accentColor,
      accentCustom: safe.accentCustom,
      homeWidgets: { visible },
      ai: {
        canReadNotes: safe.aiCanReadNotes,
        enabled: aiKey.length > 0 ? true : settings.ai.enabled,
        provider: aiKey.length > 0 ? providerForKey(aiKey) : settings.ai.provider,
      },
    },
    aiKey,
    profile: {
      name: safe.name,
      role: roleProfileLabel(safe.role),
      wake: safe.wake,
      sleep: safe.sleep,
      bestTime: peakLabel(safe.peakStart),
      focusStyle: safe.focusStyle,
      noise: safe.noise,
      accent: safe.accentColor,
      customAccent: safe.accentCustom,
      onboarded: true,
    },
    pomodoro: { work, break: rest },
    layout: {
      order,
      hidden: order.filter(
        (id) => DEFAULT_HOME_WIDGET_ORDER.includes(id) && !safe.widgets.includes(id),
      ),
    },
    legacyTheme: safe.theme === 'system' ? 'auto' : safe.theme,
  };
}


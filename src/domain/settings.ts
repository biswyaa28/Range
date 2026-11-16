import { ACCENTS } from './color';
import { normTs } from './dates';
import { FOCUS_MIN } from './focusPresets';
import { EPOCH_TS } from './types';

/**
 * Versioned user preferences.
 *
 * This module is pure: it owns the shape, defaults, normalization and the
 * migration ladder. Persistence lives in `@/store/settingsStore`.
 */

export const SETTINGS_SCHEMA_VERSION = 1;
export const SETTINGS_STORAGE_KEY = 'personalOS_settings_v1';
export const SETTINGS_BACKUP_KEY = 'personalOS_settings_v1_backup';

export type ThemePreference = 'light' | 'dark' | 'system';

export type AccentColor =
  | 'mono'
  | 'blue'
  | 'violet'
  | 'pink'
  | 'orange'
  | 'teal'
  | 'lime'
  | 'red'
  | 'custom';

export type FontPreference = 'system' | 'serif' | 'mono';

export type Density = 'compact' | 'comfortable' | 'spacious';

export type AnimationLevel = 'full' | 'reduced' | 'off';

/** 0 = Sunday, 1 = Monday, 6 = Saturday (matches Date#getDay). */
export type WeekStart = 0 | 1 | 6;

export type ClockFormat = '12h' | '24h';

export type AIProvider = 'gemini' | 'groq' | 'openrouter';

export type OnboardingRole = 'student' | 'work' | 'other';

export type FocusStyle = 'pomodoro' | 'deep' | 'long';

export type NoisePreference = 'none' | 'white' | 'pink' | 'brown';

export type TimetableSource = 'upload' | 'manual' | 'later';

export type GoalId =
  | 'assignments'
  | 'exams'
  | 'projects'
  | 'skills'
  | 'consistency'
  | 'balance';

export type TimetableBlockCategory =
  | 'class'
  | 'study'
  | 'work'
  | 'exercise'
  | 'meal'
  | 'personal'
  | 'other';

export type TimetableBlockColors = Record<TimetableBlockCategory, string> &
  Record<string, string>;

export interface HomeWidgetSettings {
  order: string[];
  visible: Record<string, boolean>;
}

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface NotificationSettings {
  enabled: boolean;
  deadlines: boolean;
  tasks: boolean;
  focus: boolean;
  weeklyDigest: boolean;
  quietHours: QuietHours;
}

export interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  canReadNotes: boolean;
}

export interface IdentitySettings {
  name: string;
  role: OnboardingRole;
  goals: GoalId[];
}

export interface RhythmSettings {
  wake: string;
  sleep: string;
  peakStart: string;
  peakEnd: string;
}

export interface FocusDefaults {
  style: FocusStyle;
  noise: NoisePreference;
  workMinutes: number;
  breakMinutes: number;
}

export interface OnboardingState {
  completed: boolean;
  completedAt: string | null;
  timetable: TimetableSource | null;
}

export interface Settings {
  theme: ThemePreference;
  accentColor: AccentColor;
  accentCustom: string;
  font: FontPreference;
  density: Density;
  cornerRadius: number;
  animation: AnimationLevel;
  haptics: boolean;
  weekStart: WeekStart;
  clockFormat: ClockFormat;
  homeWidgets: HomeWidgetSettings;
  timetableColors: TimetableBlockColors;
  notifications: NotificationSettings;
  ai: AISettings;
  identity: IdentitySettings;
  rhythm: RhythmSettings;
  focus: FocusDefaults;
  onboarding: OnboardingState;
  privacy: PrivacySettings;
  /** Last local or remote mutation, used for last-write-wins sync. */
  updatedAt: string;
}

export interface PrivacySettings {
  /** Opt-in; nothing leaves the device unless this is true. */
  crashReports: boolean;
}

export interface NotificationSettingsPatch {
  enabled?: boolean;
  deadlines?: boolean;
  tasks?: boolean;
  focus?: boolean;
  weeklyDigest?: boolean;
  quietHours?: Partial<QuietHours>;
}

export interface SettingsPatch {
  theme?: ThemePreference;
  accentColor?: AccentColor;
  accentCustom?: string;
  font?: FontPreference;
  density?: Density;
  cornerRadius?: number;
  animation?: AnimationLevel;
  haptics?: boolean;
  weekStart?: WeekStart;
  clockFormat?: ClockFormat;
  homeWidgets?: Partial<HomeWidgetSettings>;
  timetableColors?: Record<string, string>;
  notifications?: NotificationSettingsPatch;
  ai?: Partial<AISettings>;
  identity?: Partial<IdentitySettings>;
  rhythm?: Partial<RhythmSettings>;
  focus?: Partial<FocusDefaults>;
  onboarding?: Partial<OnboardingState>;
  privacy?: Partial<PrivacySettings>;
}

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
export const ACCENT_COLORS: readonly AccentColor[] = [
  'mono',
  'blue',
  'violet',
  'pink',
  'orange',
  'teal',
  'lime',
  'red',
  'custom',
];
export const FONT_PREFERENCES: readonly FontPreference[] = ['system', 'serif', 'mono'];
export const DENSITIES: readonly Density[] = ['compact', 'comfortable', 'spacious'];
export const ANIMATION_LEVELS: readonly AnimationLevel[] = ['full', 'reduced', 'off'];
export const CLOCK_FORMATS: readonly ClockFormat[] = ['12h', '24h'];
export const AI_PROVIDERS: readonly AIProvider[] = ['gemini', 'groq', 'openrouter'];
export const ONBOARDING_ROLES: readonly OnboardingRole[] = ['student', 'work', 'other'];
export const GOAL_IDS: readonly GoalId[] = [
  'assignments',
  'exams',
  'projects',
  'skills',
  'consistency',
  'balance',
];
export const FOCUS_STYLES: readonly FocusStyle[] = ['pomodoro', 'deep', 'long'];
export const NOISE_PREFERENCES: readonly NoisePreference[] = ['none', 'white', 'pink', 'brown'];
export const TIMETABLE_SOURCES: readonly TimetableSource[] = ['upload', 'manual', 'later'];

/** Matches the ids in the Home card registry, in its default order. */
export const DEFAULT_HOME_WIDGET_ORDER: readonly string[] = [
  'progress',
  'weekly',
  'focus',
  'tasks',
  'upnext',
  'inbox',
  'deadlines',
  'streak',
  'quick',
  'health',
  'calendar',
  'timeline',
];

export const DEFAULT_TIMETABLE_COLORS: TimetableBlockColors = {
  class: '#0a84ff',
  study: '#8b7bff',
  work: '#ff9f0a',
  exercise: '#30d5c8',
  meal: '#a3e635',
  personal: '#ff5e9c',
  other: '#8e8e93',
};

export const DEFAULT_CORNER_RADIUS = 20;
export const MIN_CORNER_RADIUS = 0;
export const MAX_CORNER_RADIUS = 48;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
const BLOCK_COLOR_KEY = /^[a-z][a-z0-9-]{0,31}$/i;
const WIDGET_ID = /^[a-z][a-z0-9-]{0,63}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && TIME_OF_DAY.test(value) ? value : fallback;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

function normalizeTheme(value: unknown): ThemePreference {
  if (value === 'auto') return 'system';
  return pickEnum(value, THEME_PREFERENCES, 'system');
}

function normalizeAccentColor(value: unknown): AccentColor {
  if (typeof value === 'string') {
    if (value === 'custom') return 'custom';
    if (ACCENTS.some((accent) => accent.id === value)) return value as AccentColor;
  }
  return 'mono';
}

function normalizeCornerRadius(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CORNER_RADIUS;
  }
  return Math.min(MAX_CORNER_RADIUS, Math.max(MIN_CORNER_RADIUS, Math.round(value)));
}

function normalizeWeekStart(value: unknown): WeekStart {
  return value === 0 || value === 1 || value === 6 ? value : 1;
}

function defaultHomeWidgets(): HomeWidgetSettings {
  const visible: Record<string, boolean> = {};
  for (const id of DEFAULT_HOME_WIDGET_ORDER) {
    visible[id] = true;
  }
  return { order: [...DEFAULT_HOME_WIDGET_ORDER], visible };
}

function normalizeHomeWidgets(
  value: unknown,
  fallback: HomeWidgetSettings,
): HomeWidgetSettings {
  const src = isRecord(value) ? value : {};
  const sourceOrder = Array.isArray(src['order']) ? src['order'] : fallback.order;
  const seen = new Set<string>();
  const order: string[] = [];

  for (const item of sourceOrder) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || !WIDGET_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }

  const rawVisible = isRecord(src['visible']) ? src['visible'] : {};
  const visible: Record<string, boolean> = {};

  for (const id of order) {
    visible[id] = pickBoolean(rawVisible[id], fallback.visible[id] ?? true);
  }

  // Keep explicitly configured visibility for widgets that are not in the
  // current order yet; a later reorder can bring them back without losing state.
  for (const key of Object.keys(rawVisible)) {
    if (!WIDGET_ID.test(key)) continue;
    if (Object.prototype.hasOwnProperty.call(visible, key)) continue;
    const candidate = rawVisible[key];
    if (typeof candidate === 'boolean') visible[key] = candidate;
  }

  return { order, visible };
}

function normalizeTimetableColors(
  value: unknown,
  fallback: TimetableBlockColors,
): TimetableBlockColors {
  const out: TimetableBlockColors = { ...fallback };
  if (!isRecord(value)) return out;

  for (const [key, entry] of Object.entries(value)) {
    if (!BLOCK_COLOR_KEY.test(key) || !isHexColor(entry)) continue;
    out[key] = entry.toLowerCase();
  }
  return out;
}

function normalizeNotifications(
  value: unknown,
  fallback: NotificationSettings,
): NotificationSettings {
  const src = isRecord(value) ? value : {};
  const quiet = isRecord(src['quietHours']) ? src['quietHours'] : {};

  return {
    enabled: pickBoolean(src['enabled'], fallback.enabled),
    deadlines: pickBoolean(src['deadlines'], fallback.deadlines),
    tasks: pickBoolean(src['tasks'], fallback.tasks),
    focus: pickBoolean(src['focus'], fallback.focus),
    weeklyDigest: pickBoolean(src['weeklyDigest'], fallback.weeklyDigest),
    quietHours: {
      enabled: pickBoolean(quiet['enabled'], fallback.quietHours.enabled),
      start: pickTime(quiet['start'], fallback.quietHours.start),
      end: pickTime(quiet['end'], fallback.quietHours.end),
    },
  };
}

function normalizeAI(value: unknown, fallback: AISettings): AISettings {
  const src = isRecord(value) ? value : {};
  return {
    enabled: pickBoolean(src['enabled'], fallback.enabled),
    provider: pickEnum(src['provider'], AI_PROVIDERS, fallback.provider),
    canReadNotes: pickBoolean(src['canReadNotes'], fallback.canReadNotes),
  };
}

function normalizeGoals(value: unknown): GoalId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const goals: GoalId[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!(GOAL_IDS as readonly string[]).includes(id) || seen.has(id)) continue;
    seen.add(id);
    goals.push(id as GoalId);
  }
  return goals;
}

function normalizeIdentity(value: unknown, fallback: IdentitySettings): IdentitySettings {
  const src = isRecord(value) ? value : {};
  return {
    name:
      typeof src['name'] === 'string'
        ? src['name'].trim().slice(0, 40)
        : fallback.name,
    role: pickEnum(src['role'], ONBOARDING_ROLES, fallback.role),
    goals: normalizeGoals(src['goals']),
  };
}

function normalizeRhythm(value: unknown, fallback: RhythmSettings): RhythmSettings {
  const src = isRecord(value) ? value : {};
  return {
    wake: pickTime(src['wake'], fallback.wake),
    sleep: pickTime(src['sleep'], fallback.sleep),
    peakStart: pickTime(src['peakStart'], fallback.peakStart),
    peakEnd: pickTime(src['peakEnd'], fallback.peakEnd),
  };
}

function pickMinutes(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeFocus(value: unknown, fallback: FocusDefaults): FocusDefaults {
  const src = isRecord(value) ? value : {};
  return {
    style: pickEnum(src['style'], FOCUS_STYLES, fallback.style),
    noise: pickEnum(src['noise'], NOISE_PREFERENCES, fallback.noise),
    workMinutes: pickMinutes(src['workMinutes'], fallback.workMinutes, 1, 180),
    breakMinutes: pickMinutes(src['breakMinutes'], fallback.breakMinutes, 1, 60),
  };
}

function normalizeOnboarding(value: unknown, fallback: OnboardingState): OnboardingState {
  const src = isRecord(value) ? value : {};
  const completedAt =
    typeof src['completedAt'] === 'string' &&
    src['completedAt'].length > 0 &&
    !Number.isNaN(Date.parse(src['completedAt']))
      ? src['completedAt']
      : fallback.completedAt;
  const timetable =
    typeof src['timetable'] === 'string' &&
    (TIMETABLE_SOURCES as readonly string[]).includes(src['timetable'])
      ? (src['timetable'] as TimetableSource)
      : fallback.timetable;

  return {
    completed: pickBoolean(src['completed'], fallback.completed),
    completedAt,
    timetable,
  };
}

export function defaultSettings(): Settings {
  const fallback = defaultHomeWidgets();
  const notifications: NotificationSettings = {
    enabled: true,
    deadlines: true,
    tasks: true,
    focus: true,
    weeklyDigest: false,
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
  };
  const focusPreset = FOCUS_MIN['pomodoro'] ?? ([25, 5] as const);

  return {
    theme: 'system',
    accentColor: 'mono',
    accentCustom: '#8B7BFF',
    font: 'system',
    density: 'comfortable',
    cornerRadius: DEFAULT_CORNER_RADIUS,
    animation: 'full',
    haptics: true,
    weekStart: 1,
    clockFormat: '24h',
    homeWidgets: fallback,
    timetableColors: { ...DEFAULT_TIMETABLE_COLORS },
    notifications,
    ai: { enabled: false, provider: 'gemini', canReadNotes: false },
    identity: { name: '', role: 'student', goals: [] },
    rhythm: { wake: '07:00', sleep: '23:00', peakStart: '09:00', peakEnd: '12:00' },
    focus: {
      style: 'pomodoro',
      noise: 'none',
      workMinutes: focusPreset[0],
      breakMinutes: focusPreset[1],
    },
    onboarding: { completed: false, completedAt: null, timetable: null },
    privacy: { crashReports: false },
    updatedAt: EPOCH_TS,
  };
}

function normalizePrivacy(raw: unknown, base: PrivacySettings): PrivacySettings {
  const src = isRecord(raw) ? raw : {};
  return { crashReports: pickBoolean(src['crashReports'], base.crashReports) };
}

/** Fills gaps, rejects invalid values and returns a detached settings object. */
export function normalizeSettings(raw: unknown): Settings {
  const base = defaultSettings();
  const src = isRecord(raw) ? raw : {};

  return {
    theme: normalizeTheme(src['theme']),
    accentColor: normalizeAccentColor(src['accentColor']),
    accentCustom: isHexColor(src['accentCustom'])
      ? src['accentCustom'].toLowerCase()
      : base.accentCustom,
    font: pickEnum(src['font'], FONT_PREFERENCES, base.font),
    density: pickEnum(src['density'], DENSITIES, base.density),
    cornerRadius: normalizeCornerRadius(src['cornerRadius']),
    animation: pickEnum(src['animation'], ANIMATION_LEVELS, base.animation),
    haptics: pickBoolean(src['haptics'], base.haptics),
    weekStart: normalizeWeekStart(src['weekStart']),
    clockFormat: pickEnum(src['clockFormat'], CLOCK_FORMATS, base.clockFormat),
    homeWidgets: normalizeHomeWidgets(src['homeWidgets'], base.homeWidgets),
    timetableColors: normalizeTimetableColors(
      src['timetableColors'],
      base.timetableColors,
    ),
    notifications: normalizeNotifications(src['notifications'], base.notifications),
    ai: normalizeAI(src['ai'], base.ai),
    identity: normalizeIdentity(src['identity'], base.identity),
    rhythm: normalizeRhythm(src['rhythm'], base.rhythm),
    focus: normalizeFocus(src['focus'], base.focus),
    onboarding: normalizeOnboarding(src['onboarding'], base.onboarding),
    privacy: normalizePrivacy(src['privacy'], base.privacy),
    updatedAt: normTs(src['updatedAt']) ?? base.updatedAt,
  };
}

export function cloneSettings(settings: Settings): Settings {
  return {
    ...settings,
    homeWidgets: {
      order: [...settings.homeWidgets.order],
      visible: { ...settings.homeWidgets.visible },
    },
    timetableColors: { ...settings.timetableColors },
    notifications: {
      ...settings.notifications,
      quietHours: { ...settings.notifications.quietHours },
    },
    ai: { ...settings.ai },
    identity: { ...settings.identity, goals: [...settings.identity.goals] },
    rhythm: { ...settings.rhythm },
    focus: { ...settings.focus },
    onboarding: { ...settings.onboarding },
    privacy: { ...settings.privacy },
  };
}

/** Shallow top-level merge with explicit deep merges for nested groups. */
export function patchSettings(base: Settings, patch: SettingsPatch): Settings {
  return normalizeSettings({
    theme: patch.theme ?? base.theme,
    accentColor: patch.accentColor ?? base.accentColor,
    accentCustom: patch.accentCustom ?? base.accentCustom,
    font: patch.font ?? base.font,
    density: patch.density ?? base.density,
    cornerRadius: patch.cornerRadius ?? base.cornerRadius,
    animation: patch.animation ?? base.animation,
    haptics: patch.haptics ?? base.haptics,
    weekStart: patch.weekStart ?? base.weekStart,
    clockFormat: patch.clockFormat ?? base.clockFormat,
    homeWidgets: { ...base.homeWidgets, ...patch.homeWidgets },
    timetableColors: { ...base.timetableColors, ...patch.timetableColors },
    notifications: {
      ...base.notifications,
      ...patch.notifications,
      quietHours: {
        ...base.notifications.quietHours,
        ...patch.notifications?.quietHours,
      },
    },
    ai: { ...base.ai, ...patch.ai },
    identity: {
      ...base.identity,
      ...patch.identity,
      goals: patch.identity?.goals ?? base.identity.goals,
    },
    rhythm: { ...base.rhythm, ...patch.rhythm },
    focus: { ...base.focus, ...patch.focus },
    onboarding: { ...base.onboarding, ...patch.onboarding },
    privacy: { ...base.privacy, ...patch.privacy },
    updatedAt: base.updatedAt,
  });
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

export interface SettingsEnvelope {
  schemaVersion: number;
  data: Settings;
}

export type SettingsMigration = (
  raw: Record<string, unknown>,
) => Record<string, unknown>;

export interface UnwrappedSettings {
  data: unknown;
  version: number;
}

/**
 * Reads the versioned envelope. A legacy AppState blob (identified by its
 * `settings`/`profile` groups) is treated as version 0 even though the app
 * data itself uses `schemaVersion: 2`.
 */
export function unwrapSettingsPayload(raw: unknown): UnwrappedSettings {
  if (!isRecord(raw)) return { data: raw, version: 0 };

  if (isRecord(raw['data']) && 'schemaVersion' in raw) {
    const version =
      typeof raw['schemaVersion'] === 'number' && Number.isInteger(raw['schemaVersion'])
        ? Math.max(0, raw['schemaVersion'])
        : 0;
    return { data: raw['data'], version };
  }

  const looksLikeAppState = isRecord(raw['settings']) || isRecord(raw['profile']);
  if (looksLikeAppState) return { data: raw, version: 0 };

  const version =
    typeof raw['schemaVersion'] === 'number' && Number.isInteger(raw['schemaVersion'])
      ? Math.max(0, raw['schemaVersion'])
      : 0;
  return { data: raw, version };
}

function legacyAccent(
  candidate: unknown,
  custom: unknown,
): { accentColor: AccentColor; accentCustom?: string } | null {
  if (typeof candidate === 'string') {
    if (isHexColor(candidate)) {
      return { accentColor: 'custom', accentCustom: candidate.toLowerCase() };
    }
    if (candidate === 'custom') {
      return isHexColor(custom)
        ? { accentColor: 'custom', accentCustom: custom.toLowerCase() }
        : { accentColor: 'custom' };
    }
    if (ACCENTS.some((accent) => accent.id === candidate)) {
      return { accentColor: candidate as AccentColor };
    }
  }
  return null;
}

function legacyRole(value: unknown): OnboardingRole {
  if (typeof value !== 'string') return 'student';
  const role = value.trim().toLowerCase();
  if (role.includes('student') || role.includes('college') || role.includes('school')) {
    return 'student';
  }
  if (role.includes('work') || role.includes('profession') || role.includes('job')) {
    return 'work';
  }
  return 'other';
}

function legacyFocusStyle(value: unknown): FocusStyle {
  return pickEnum(value, FOCUS_STYLES, 'pomodoro');
}

function legacyNoise(value: unknown): NoisePreference {
  return pickEnum(value, NOISE_PREFERENCES, 'none');
}

const LEGACY_PEAK_HOURS: Readonly<Record<string, { start: string; end: string }>> = {
  morning: { start: '09:00', end: '12:00' },
  afternoon: { start: '13:00', end: '16:00' },
  evening: { start: '18:00', end: '21:00' },
  night: { start: '21:00', end: '23:00' },
};

function legacyPeak(value: unknown): { start: string; end: string } | null {
  if (typeof value !== 'string') return null;
  return LEGACY_PEAK_HOURS[value.trim().toLowerCase()] ?? null;
}


/**
 * v0 is the pre-settings-store shape: either a flat preferences object or the
 * legacy AppState blob with `settings` and `profile` groups. Only values that
 * have a new-home are carried across; everything else falls back to defaults.
 */
export function migrateSettingsV0toV1(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const legacySettings = isRecord(raw['settings']) ? raw['settings'] : raw;
  const profile = isRecord(raw['profile']) ? raw['profile'] : {};
  const out: Record<string, unknown> = { ...raw, ...legacySettings };

  delete out['settings'];
  delete out['profile'];

  const theme = legacySettings['theme'];
  out['theme'] = theme === 'auto' ? 'system' : theme;

  const legacyCustomAccent =
    legacySettings['customAccent'] ?? legacySettings['accentCustom'];
  const accent =
    legacyAccent(legacySettings['accentColor'], legacySettings['accentCustom']) ??
    legacyAccent(legacySettings['accent'], legacyCustomAccent) ??
    legacyAccent(profile['accent'], profile['customAccent']);

  if (accent) {
    out['accentColor'] = accent.accentColor;
    if (accent.accentCustom) out['accentCustom'] = accent.accentCustom;
  }

  if (isHexColor(profile['customAccent']) && !isHexColor(out['accentCustom'])) {
    out['accentCustom'] = profile['customAccent'].toLowerCase();
  }

  const legacyHaptics = legacySettings['haptics'];
  if (typeof legacyHaptics === 'boolean') {
    out['haptics'] = legacyHaptics;
  } else if (isRecord(legacyHaptics) && typeof legacyHaptics['on'] === 'boolean') {
    out['haptics'] = legacyHaptics['on'];
  } else if (isRecord(profile['haptics']) && typeof profile['haptics']['on'] === 'boolean') {
    out['haptics'] = profile['haptics']['on'];
  }

  // Identity: the legacy profile owned the name/role that the wizard now stores.
  const identity: Record<string, unknown> = isRecord(out['identity'])
    ? { ...out['identity'] }
    : {};
  const legacyName = profile['name'];
  if (typeof legacyName === 'string' && legacyName.trim()) {
    identity['name'] = legacyName.trim();
  }
  if (typeof profile['role'] === 'string' && profile['role'].trim()) {
    identity['role'] = legacyRole(profile['role']);
  }
  if (Object.keys(identity).length > 0) out['identity'] = identity;

  const rhythm: Record<string, unknown> = isRecord(out['rhythm'])
    ? { ...out['rhythm'] }
    : {};
  if (typeof profile['wake'] === 'string') rhythm['wake'] = profile['wake'];
  if (typeof profile['sleep'] === 'string') rhythm['sleep'] = profile['sleep'];
  const peak = legacyPeak(profile['bestTime']);
  if (peak) {
    rhythm['peakStart'] = peak.start;
    rhythm['peakEnd'] = peak.end;
  }
  if (Object.keys(rhythm).length > 0) out['rhythm'] = rhythm;

  const focus: Record<string, unknown> = isRecord(out['focus']) ? { ...out['focus'] } : {};
  if (typeof profile['focusStyle'] === 'string') {
    focus['style'] = legacyFocusStyle(profile['focusStyle']);
  }
  if (typeof profile['noise'] === 'string') {
    focus['noise'] = legacyNoise(profile['noise']);
  }
  const legacyPomodoro = legacySettings['pomodoro'];
  if (isRecord(legacyPomodoro)) {
    if (typeof legacyPomodoro['work'] === 'number') {
      focus['workMinutes'] = legacyPomodoro['work'];
    }
    if (typeof legacyPomodoro['break'] === 'number') {
      focus['breakMinutes'] = legacyPomodoro['break'];
    }
  }
  if (Object.keys(focus).length > 0) out['focus'] = focus;

  const onboarding: Record<string, unknown> = isRecord(out['onboarding'])
    ? { ...out['onboarding'] }
    : {};
  if (typeof profile['onboarded'] === 'boolean') {
    onboarding['completed'] = profile['onboarded'];
    if (profile['onboarded'] && typeof profile['updatedAt'] === 'string') {
      onboarding['completedAt'] = profile['updatedAt'];
    }
  }
  if (Object.keys(onboarding).length > 0) out['onboarding'] = onboarding;

  return out;
}

export const SETTINGS_MIGRATIONS: Readonly<Record<number, SettingsMigration>> = {
  0: migrateSettingsV0toV1,
};

/**
 * Runs every migration between the stored version and the current schema,
 * then normalizes the result. Unknown or malformed input never throws.
 */
export function migrateSettings(raw: unknown): Settings {
  const { data, version } = unwrapSettingsPayload(raw);
  let current: Record<string, unknown> = isRecord(data) ? { ...data } : {};
  let from = version;
  let guard = 0;

  while (from < SETTINGS_SCHEMA_VERSION && guard < 32) {
    const migration = SETTINGS_MIGRATIONS[from];
    if (!migration) break;
    current = migration(current);
    from++;
    guard++;
  }

  return normalizeSettings(current);
}

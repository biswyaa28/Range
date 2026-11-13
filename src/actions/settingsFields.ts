import { z } from 'zod';
import {
  ACCENT_COLORS,
  AI_PROVIDERS,
  ANIMATION_LEVELS,
  CLOCK_FORMATS,
  DEFAULT_HOME_WIDGET_ORDER,
  DEFAULT_TIMETABLE_COLORS,
  DENSITIES,
  FOCUS_STYLES,
  FONT_PREFERENCES,
  GOAL_IDS,
  MAX_CORNER_RADIUS,
  MIN_CORNER_RADIUS,
  NOISE_PREFERENCES,
  ONBOARDING_ROLES,
  THEME_PREFERENCES,
  TIMETABLE_SOURCES,
  type Settings,
} from '@/domain/settings';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

const hexColor = z.string().regex(HEX_COLOR, 'Use a 6-digit hex color such as #8B7BFF.');
const timeOfDay = z.string().regex(TIME_OF_DAY, 'Use 24-hour time such as 09:30.');
const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Use a valid ISO date and time.');

function oneOf<T extends string>(values: readonly T[]): z.ZodType<T> {
  return z.string().refine((value): value is T => (values as readonly string[]).includes(value), {
    message: `Choose one of: ${values.join(', ')}.`,
  });
}

function uniqueWidgetOrder(order: string[]): boolean {
  return new Set(order).size === order.length;
}

const widgetOrder = z
  .array(oneOf(DEFAULT_HOME_WIDGET_ORDER))
  .min(1, 'Keep at least one Home card.')
  .refine(uniqueWidgetOrder, 'Each Home card can appear only once.');

const goals = z.array(oneOf(GOAL_IDS)).max(GOAL_IDS.length);

export interface SettingsField {
  path: string;
  label: string;
  schema: z.ZodType<unknown>;
  read(settings: Settings): unknown;
  write(settings: Settings, rawValue: unknown): void;
}

function defineField<T>(
  path: string,
  label: string,
  schema: z.ZodType<T>,
  read: (settings: Settings) => T,
  write: (settings: Settings, value: T) => void,
): SettingsField {
  return {
    path,
    label,
    schema,
    read,
    write: (settings, rawValue) => {
      write(settings, schema.parse(rawValue));
    },
  };
}

const fields: SettingsField[] = [
  defineField(
    'theme',
    'Theme',
    oneOf(THEME_PREFERENCES),
    (settings) => settings.theme,
    (settings, value) => {
      settings.theme = value;
    },
  ),
  defineField(
    'accentColor',
    'Accent',
    oneOf(ACCENT_COLORS),
    (settings) => settings.accentColor,
    (settings, value) => {
      settings.accentColor = value;
    },
  ),
  defineField(
    'accentCustom',
    'Custom accent',
    hexColor,
    (settings) => settings.accentCustom,
    (settings, value) => {
      settings.accentCustom = value.toLowerCase();
    },
  ),
  defineField(
    'font',
    'Font',
    oneOf(FONT_PREFERENCES),
    (settings) => settings.font,
    (settings, value) => {
      settings.font = value;
    },
  ),
  defineField(
    'density',
    'Density',
    oneOf(DENSITIES),
    (settings) => settings.density,
    (settings, value) => {
      settings.density = value;
    },
  ),
  defineField(
    'cornerRadius',
    'Corner radius',
    z.number().int().min(MIN_CORNER_RADIUS).max(MAX_CORNER_RADIUS),
    (settings) => settings.cornerRadius,
    (settings, value) => {
      settings.cornerRadius = value;
    },
  ),
  defineField(
    'animation',
    'Motion',
    oneOf(ANIMATION_LEVELS),
    (settings) => settings.animation,
    (settings, value) => {
      settings.animation = value;
    },
  ),
  defineField(
    'haptics',
    'Haptics',
    z.boolean(),
    (settings) => settings.haptics,
    (settings, value) => {
      settings.haptics = value;
    },
  ),
  defineField(
    'weekStart',
    'Week starts',
    z.union([z.literal(0), z.literal(1), z.literal(6)]),
    (settings) => settings.weekStart,
    (settings, value) => {
      settings.weekStart = value;
    },
  ),
  defineField(
    'clockFormat',
    'Clock',
    oneOf(CLOCK_FORMATS),
    (settings) => settings.clockFormat,
    (settings, value) => {
      settings.clockFormat = value;
    },
  ),
  defineField(
    'homeWidgets.order',
    'Home card order',
    widgetOrder,
    (settings) => [...settings.homeWidgets.order],
    (settings, value) => {
      settings.homeWidgets.order = [...value];
    },
  ),
  defineField(
    'notifications.enabled',
    'Notifications',
    z.boolean(),
    (settings) => settings.notifications.enabled,
    (settings, value) => {
      settings.notifications.enabled = value;
    },
  ),
  defineField(
    'notifications.deadlines',
    'Deadline reminders',
    z.boolean(),
    (settings) => settings.notifications.deadlines,
    (settings, value) => {
      settings.notifications.deadlines = value;
    },
  ),
  defineField(
    'notifications.tasks',
    'Task reminders',
    z.boolean(),
    (settings) => settings.notifications.tasks,
    (settings, value) => {
      settings.notifications.tasks = value;
    },
  ),
  defineField(
    'notifications.focus',
    'Focus reminders',
    z.boolean(),
    (settings) => settings.notifications.focus,
    (settings, value) => {
      settings.notifications.focus = value;
    },
  ),
  defineField(
    'notifications.weeklyDigest',
    'Weekly digest',
    z.boolean(),
    (settings) => settings.notifications.weeklyDigest,
    (settings, value) => {
      settings.notifications.weeklyDigest = value;
    },
  ),
  defineField(
    'notifications.quietHours.enabled',
    'Quiet hours',
    z.boolean(),
    (settings) => settings.notifications.quietHours.enabled,
    (settings, value) => {
      settings.notifications.quietHours.enabled = value;
    },
  ),
  defineField(
    'notifications.quietHours.start',
    'Quiet hours start',
    timeOfDay,
    (settings) => settings.notifications.quietHours.start,
    (settings, value) => {
      settings.notifications.quietHours.start = value;
    },
  ),
  defineField(
    'notifications.quietHours.end',
    'Quiet hours end',
    timeOfDay,
    (settings) => settings.notifications.quietHours.end,
    (settings, value) => {
      settings.notifications.quietHours.end = value;
    },
  ),
  defineField(
    'ai.enabled',
    'AI assistance',
    z.boolean(),
    (settings) => settings.ai.enabled,
    (settings, value) => {
      settings.ai.enabled = value;
    },
  ),
  defineField(
    'ai.provider',
    'AI provider',
    oneOf(AI_PROVIDERS),
    (settings) => settings.ai.provider,
    (settings, value) => {
      settings.ai.provider = value;
    },
  ),
  defineField(
    'ai.canReadNotes',
    'AI can read notes',
    z.boolean(),
    (settings) => settings.ai.canReadNotes,
    (settings, value) => {
      settings.ai.canReadNotes = value;
    },
  ),
  defineField(
    'identity.name',
    'Name',
    z.string().trim().min(1, 'Enter a name.').max(40),
    (settings) => settings.identity.name,
    (settings, value) => {
      settings.identity.name = value;
    },
  ),
  defineField(
    'identity.role',
    'Role',
    oneOf(ONBOARDING_ROLES),
    (settings) => settings.identity.role,
    (settings, value) => {
      settings.identity.role = value;
    },
  ),
  defineField(
    'identity.goals',
    'Goals',
    goals,
    (settings) => [...settings.identity.goals],
    (settings, value) => {
      settings.identity.goals = [...value];
    },
  ),
  defineField(
    'rhythm.wake',
    'Wake time',
    timeOfDay,
    (settings) => settings.rhythm.wake,
    (settings, value) => {
      settings.rhythm.wake = value;
    },
  ),
  defineField(
    'rhythm.sleep',
    'Sleep time',
    timeOfDay,
    (settings) => settings.rhythm.sleep,
    (settings, value) => {
      settings.rhythm.sleep = value;
    },
  ),
  defineField(
    'rhythm.peakStart',
    'Peak focus start',
    timeOfDay,
    (settings) => settings.rhythm.peakStart,
    (settings, value) => {
      settings.rhythm.peakStart = value;
    },
  ),
  defineField(
    'rhythm.peakEnd',
    'Peak focus end',
    timeOfDay,
    (settings) => settings.rhythm.peakEnd,
    (settings, value) => {
      settings.rhythm.peakEnd = value;
    },
  ),
  defineField(
    'focus.style',
    'Focus style',
    oneOf(FOCUS_STYLES),
    (settings) => settings.focus.style,
    (settings, value) => {
      settings.focus.style = value;
    },
  ),
  defineField(
    'focus.noise',
    'Focus sound',
    oneOf(NOISE_PREFERENCES),
    (settings) => settings.focus.noise,
    (settings, value) => {
      settings.focus.noise = value;
    },
  ),
  defineField(
    'focus.workMinutes',
    'Focus length',
    z.number().int().min(1).max(180),
    (settings) => settings.focus.workMinutes,
    (settings, value) => {
      settings.focus.workMinutes = value;
    },
  ),
  defineField(
    'focus.breakMinutes',
    'Break length',
    z.number().int().min(1).max(60),
    (settings) => settings.focus.breakMinutes,
    (settings, value) => {
      settings.focus.breakMinutes = value;
    },
  ),
  defineField(
    'onboarding.completed',
    'Onboarding complete',
    z.boolean(),
    (settings) => settings.onboarding.completed,
    (settings, value) => {
      settings.onboarding.completed = value;
    },
  ),
  defineField(
    'onboarding.completedAt',
    'Onboarding completed at',
    isoDateTime.nullable(),
    (settings) => settings.onboarding.completedAt,
    (settings, value) => {
      settings.onboarding.completedAt = value;
    },
  ),
  defineField(
    'onboarding.timetable',
    'Timetable source',
    oneOf(TIMETABLE_SOURCES).nullable(),
    (settings) => settings.onboarding.timetable,
    (settings, value) => {
      settings.onboarding.timetable = value;
    },
  ),
];

for (const id of DEFAULT_HOME_WIDGET_ORDER) {
  fields.push(
    defineField(
      `homeWidgets.visible.${id}`,
      `Home card “${id}” visible`,
      z.boolean(),
      (settings) => settings.homeWidgets.visible[id] !== false,
      (settings, value) => {
        settings.homeWidgets.visible[id] = value;
      },
    ),
  );
}

for (const category of Object.keys(DEFAULT_TIMETABLE_COLORS)) {
  fields.push(
    defineField(
      `timetableColors.${category}`,
      `Timetable color: ${category}`,
      hexColor,
      (settings) => settings.timetableColors[category] ?? DEFAULT_TIMETABLE_COLORS[category] ?? '',
      (settings, value) => {
        settings.timetableColors[category] = value.toLowerCase();
      },
    ),
  );
}

export const SETTING_FIELDS: ReadonlyMap<string, SettingsField> = new Map(
  fields.map((field) => [field.path, field]),
);

export const SETTING_PATHS: readonly string[] = fields.map((field) => field.path);

const JSON_LITERAL =
  /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|".*"|\[.*\]|\{.*\})$/s;

/**
 * Tool calls often arrive with every value as a string. Parse JSON-looking
 * values once so numbers, booleans, arrays and objects validate as themselves.
 */
const settingValue = z.unknown().transform((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!JSON_LITERAL.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
});

export const changeSettingSchema = z
  .object({
    path: z.string().min(1),
    value: settingValue,
  })
  .superRefine((input, context) => {
    const field = SETTING_FIELDS.get(input.path);
    if (!field) {
      context.addIssue({
        code: 'custom',
        path: ['path'],
        message: `Unknown settings field “${input.path}”.`,
      });
      return;
    }

    const result = field.schema.safeParse(input.value);
    if (!result.success) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: `${field.label}: ${result.error.issues[0]?.message ?? 'invalid value'}`,
      });
    }
  });

export function settingField(path: string): SettingsField {
  const field = SETTING_FIELDS.get(path);
  if (!field) throw new Error(`Unknown settings field “${path}”.`);
  return field;
}

export function formatSetting(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

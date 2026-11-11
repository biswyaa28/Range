export const EPOCH_TS = '1970-01-01T00:00:00.000Z';
export const STORAGE_KEY = 'personalOS_v1';
export const BACKUP_KEY = 'personalOS_v1_backup';
export const SCHEMA_VERSION = 2;

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  deviceId: string;
}

export type BlockCategory =
  | 'class'
  | 'study'
  | 'work'
  | 'exercise'
  | 'meal'
  | 'personal'
  | 'other';

export type BlockSource = 'college' | 'personal';

export interface Block extends BaseRecord {
  title: string;
  day: number | string; // 0-6 weekly (Monday=0) or ISO date string (YYYY-MM-DD)
  start: string; // HH:MM
  end: string; // HH:MM
  category: BlockCategory | string;
  done: boolean;
  doneDates: string[]; // ISO date strings
  source?: BlockSource | string;
}

export type TaskPriority = 'high' | 'med' | 'low';

export interface Task extends BaseRecord {
  title: string;
  due: string | null; // ISO date string or null
  priority: TaskPriority;
  done: boolean;
  category: string;
}

export interface Note extends BaseRecord {
  title: string;
  body: string;
  pinned: boolean;
  private?: boolean;
}

export type DeadlineType = 'assignment' | 'exam' | 'announcement';
export type DeadlineStatus = 'pending' | 'approved' | 'done';
export type DeadlineSource = 'college-sync' | 'personal';

export interface Deadline extends BaseRecord {
  title: string;
  course: string;
  due: string; // ISO date string
  type: DeadlineType;
  status: DeadlineStatus;
  source: DeadlineSource | string;
}

export interface DayStats {
  date: string; // ISO date string
  blocksDone: number;
  blocksTotal: number;
  tasksDone: number;
  focusMinutes: number;
  updatedAt: string;
}

export type ThemeMode = 'auto' | 'dark' | 'light';

export interface HapticsConfig {
  on: boolean;
  level: 'light' | 'medium' | 'strong';
  sound: boolean;
}

export interface Profile {
  onboarded: boolean;
  name: string;
  greeting: 'auto' | string;
  role: string;
  level: string;
  field: string;
  wake: string;
  sleep: string;
  bestTime: string;
  studyHours: number;
  weeklyGoal: string;
  focusStyle: 'pomodoro' | string;
  noise: 'none' | 'white' | 'pink' | 'brown' | string;
  preset: 'balanced' | string;
  accent: string;
  customAccent: string;
  haptics: HapticsConfig;
  recentCmds: string[];
  updatedAt: string;
}

export type BentoCardSize = 'S' | 'M' | 'L' | 'XL';

export interface Layout {
  order: string[];
  size: Record<string, BentoCardSize>;
  hidden: string[];
  updatedAt: string;
}

export interface PomodoroSettings {
  work: number;
  break: number;
}

export interface SoundSettings {
  master: number;
  white: number;
  pink: number;
  brown: number;
}

export interface PrompterSettings {
  text: string;
  size: number;
  speed: number;
}

export interface Settings {
  theme: ThemeMode;
  seeded: boolean;
  pomodoro: PomodoroSettings;
  sound: SoundSettings;
  prompter: PrompterSettings;
  updatedAt: string;
}

export interface AppState {
  blocks: Block[];
  tasks: Task[];
  notes: Note[];
  deadlines: Deadline[];
  dayStats: Record<string, DayStats>;
  profile: Profile;
  layout: Layout;
  settings: Settings;
  schemaVersion: 2;
  deviceId: string;
  syncedAt: string;
  clearedAt?: string;
}

export function defaultState(): AppState {
  return {
    blocks: [],
    tasks: [],
    notes: [],
    deadlines: [],
    dayStats: {},
    profile: {
      onboarded: false,
      name: '',
      greeting: 'auto',
      role: '',
      level: '',
      field: '',
      wake: '07:00',
      sleep: '23:00',
      bestTime: '',
      studyHours: 3,
      weeklyGoal: '',
      focusStyle: 'pomodoro',
      noise: 'none',
      preset: 'balanced',
      accent: 'mono',
      customAccent: '',
      haptics: { on: true, level: 'medium', sound: false },
      recentCmds: [],
      updatedAt: EPOCH_TS,
    },
    layout: {
      order: [],
      size: {},
      hidden: [],
      updatedAt: EPOCH_TS,
    },
    settings: {
      theme: 'auto',
      seeded: false,
      pomodoro: { work: 25, break: 5 },
      sound: { master: 60, white: 50, pink: 50, brown: 50 },
      prompter: { text: '', size: 48, speed: 3 },
      updatedAt: EPOCH_TS,
    },
    schemaVersion: 2,
    deviceId: '',
    syncedAt: EPOCH_TS,
  };
}


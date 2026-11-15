import type { Page } from '@playwright/test';

export const STRESS_COUNT = 5000;

/** Builds a save with `count` tasks for the 5,000-item checks. */
export function buildStressState(count: number): Record<string, unknown> {
  const now = new Date().toISOString();
  const tasks = Array.from({ length: count }, (_, index) => ({
    id: `stress-task-${index}`,
    title: `Stress task ${index + 1}`,
    due: index % 3 === 0 ? null : `2026-11-${String((index % 28) + 1).padStart(2, '0')}`,
    priority: index % 5 === 0 ? 'high' : index % 2 === 0 ? 'med' : 'low',
    done: false,
    category: 'study',
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deviceId: 'stress-profile',
  }));

  return {
    blocks: [],
    tasks,
    notes: [],
    deadlines: [],
    habits: [],
    dayStats: {},
    profile: {
      onboarded: true,
      name: 'Stress',
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
      haptics: { on: false, level: 'medium', sound: false },
      recentCmds: [],
      updatedAt: now,
    },
    layout: { order: [], size: {}, hidden: [], updatedAt: now },
    settings: {
      theme: 'auto',
      seeded: false,
      pomodoro: { work: 25, break: 5 },
      sound: { master: 60, white: 50, pink: 50, brown: 50 },
      prompter: { text: '', size: 48, speed: 3 },
      updatedAt: now,
    },
    schemaVersion: 2,
    deviceId: 'stress-profile',
    syncedAt: now,
  };
}

/** Seeds the stress profile before the app boots. */
export async function seedStressProfile(page: Page, count = STRESS_COUNT): Promise<void> {
  const state = buildStressState(count);
  await page.addInitScript((save) => {
    window.localStorage.setItem('personalOS_v1', JSON.stringify(save));
  }, state);
}

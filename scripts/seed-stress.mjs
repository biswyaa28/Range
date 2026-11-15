#!/usr/bin/env node
/**
 * Writes a 5,000-task test profile that can be loaded into a browser or
 * Playwright context. Usage: npm run seed:stress -- 5000
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const arg = Number(process.argv[2] ?? 5000);
const count = Number.isFinite(arg) && arg > 0 ? Math.floor(arg) : 5000;
const out = resolve('.tmp/stress-profile.json');

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

const state = {
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

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ key: 'personalOS_v1', state }), 'utf8');
console.log(`Wrote ${count} tasks to ${out}`);

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HOME_WIDGET_ORDER,
  SETTINGS_SCHEMA_VERSION,
  defaultSettings,
  migrateSettings,
  normalizeSettings,
  patchSettings,
} from '@/domain/settings';

describe('settings domain', () => {
  it('provides a complete, detached default settings object', () => {
    const first = defaultSettings();
    const second = defaultSettings();

    expect(first.theme).toBe('system');
    expect(first.accentColor).toBe('mono');
    expect(first.font).toBe('system');
    expect(first.density).toBe('comfortable');
    expect(first.cornerRadius).toBe(20);
    expect(first.animation).toBe('full');
    expect(first.haptics).toBe(true);
    expect(first.weekStart).toBe(1);
    expect(first.clockFormat).toBe('24h');
    expect(first.homeWidgets.order).toEqual([...DEFAULT_HOME_WIDGET_ORDER]);
    expect(first.homeWidgets.visible['progress']).toBe(true);
    expect(first.timetableColors.class).toBe('#0a84ff');
    expect(first.notifications.enabled).toBe(true);
    expect(first.notifications.quietHours.start).toBe('22:00');
    expect(first.ai).toEqual({
      enabled: false,
      provider: 'gemini',
      canReadNotes: false,
    });
    expect(first.identity).toEqual({ name: '', role: 'student', goals: [] });
    expect(first.rhythm).toEqual({
      wake: '07:00',
      sleep: '23:00',
      peakStart: '09:00',
      peakEnd: '12:00',
    });
    expect(first.focus).toEqual({
      style: 'pomodoro',
      noise: 'none',
      workMinutes: 25,
      breakMinutes: 5,
    });
    expect(first.onboarding).toEqual({
      completed: false,
      completedAt: null,
      timetable: null,
    });

    first.homeWidgets.order.push('extra');
    expect(second.homeWidgets.order).not.toContain('extra');
    expect(first.homeWidgets).not.toBe(second.homeWidgets);
  });

  it('normalizes a full valid payload', () => {
    const settings = normalizeSettings({
      theme: 'dark',
      accentColor: 'custom',
      accentCustom: '#ABCDEF',
      font: 'serif',
      density: 'spacious',
      cornerRadius: 26,
      animation: 'off',
      haptics: false,
      weekStart: 6,
      clockFormat: '12h',
      homeWidgets: { order: ['tasks', 'focus'], visible: { tasks: false } },
      timetableColors: { class: '#123456', party: '#654321' },
      notifications: {
        enabled: false,
        deadlines: false,
        quietHours: { enabled: true, start: '21:30', end: '06:45' },
      },
      ai: {
        enabled: true,
        provider: 'groq',
        canReadNotes: true,
        apiKey: '  sk-ant-12345678  ',
      },
      identity: {
        name: '  Ada  ',
        role: 'work',
        goals: ['exams', 'skills', 'exams', 'nope'],
      },
      rhythm: { wake: '06:30', sleep: '22:15', peakStart: '08:00', peakEnd: '11:00' },
      focus: { style: 'deep', noise: 'pink', workMinutes: 45, breakMinutes: 8 },
      onboarding: {
        completed: true,
        completedAt: '2026-11-10T08:00:00.000Z',
        timetable: 'upload',
      },
    });

    expect(settings.theme).toBe('dark');
    expect(settings.accentColor).toBe('custom');
    expect(settings.accentCustom).toBe('#abcdef');
    expect(settings.font).toBe('serif');
    expect(settings.density).toBe('spacious');
    expect(settings.cornerRadius).toBe(26);
    expect(settings.animation).toBe('off');
    expect(settings.haptics).toBe(false);
    expect(settings.weekStart).toBe(6);
    expect(settings.clockFormat).toBe('12h');
    expect(settings.homeWidgets.order).toEqual(['tasks', 'focus']);
    expect(settings.homeWidgets.visible).toEqual({ tasks: false, focus: true });
    expect(settings.timetableColors.class).toBe('#123456');
    expect(settings.timetableColors.party).toBe('#654321');
    expect(settings.notifications.enabled).toBe(false);
    expect(settings.notifications.deadlines).toBe(false);
    expect(settings.notifications.tasks).toBe(true);
    expect(settings.notifications.quietHours).toEqual({
      enabled: true,
      start: '21:30',
      end: '06:45',
    });
    expect(settings.ai).toEqual({
      enabled: true,
      provider: 'groq',
      canReadNotes: true,
    });
    // The key is not part of Settings, so normalization drops any stray copy.
    expect(settings.ai).not.toHaveProperty('apiKey');
    expect(settings.identity).toEqual({
      name: 'Ada',
      role: 'work',
      goals: ['exams', 'skills'],
    });
    expect(settings.rhythm).toEqual({
      wake: '06:30',
      sleep: '22:15',
      peakStart: '08:00',
      peakEnd: '11:00',
    });
    expect(settings.focus).toEqual({
      style: 'deep',
      noise: 'pink',
      workMinutes: 45,
      breakMinutes: 8,
    });
    expect(settings.onboarding).toEqual({
      completed: true,
      completedAt: '2026-11-10T08:00:00.000Z',
      timetable: 'upload',
    });
  });

  it('rejects invalid values and clamps numbers', () => {
    const settings = normalizeSettings({
      theme: 'neon',
      accentColor: 'chartreuse',
      accentCustom: 'not-a-color',
      font: 'comic',
      density: 'huge',
      cornerRadius: 999,
      animation: 'sometimes',
      haptics: 'yes',
      weekStart: 3,
      clockFormat: '13h',
      homeWidgets: { order: [' tasks ', 'tasks', 'focus', 42, ''], visible: { focus: 'yes' } },
      timetableColors: { class: 'red', 'bad key': '#ffffff', party: '#ABCDEF' },
      notifications: {
        quietHours: { start: '9:00', end: '23:59' },
        enabled: 'no',
      },
      ai: { provider: 'unknown', enabled: 'yes', apiKey: 42 },
      identity: { name: 42, role: 'astronaut', goals: ['exams', 'exams', 3, 'nope'] },
      rhythm: { wake: '7:00', sleep: '25:00', peakStart: '09:00', peakEnd: 'oops' },
      focus: { style: 'marathon', noise: 'rain', workMinutes: 999, breakMinutes: -4 },
      onboarding: { completed: 'yes', completedAt: 'nope', timetable: 'fax' },
    });

    expect(settings.theme).toBe('system');
    expect(settings.accentColor).toBe('mono');
    expect(settings.accentCustom).toBe('#8B7BFF');
    expect(settings.font).toBe('system');
    expect(settings.density).toBe('comfortable');
    expect(settings.cornerRadius).toBe(48);
    expect(settings.animation).toBe('full');
    expect(settings.haptics).toBe(true);
    expect(settings.weekStart).toBe(1);
    expect(settings.clockFormat).toBe('24h');
    expect(settings.homeWidgets.order).toEqual(['tasks', 'focus']);
    expect(settings.homeWidgets.visible).toEqual({ tasks: true, focus: true });
    expect(settings.timetableColors.class).toBe('#0a84ff');
    expect(settings.timetableColors.party).toBe('#abcdef');
    expect(settings.timetableColors['bad key']).toBeUndefined();
    expect(settings.notifications.enabled).toBe(true);
    expect(settings.notifications.quietHours.start).toBe('22:00');
    expect(settings.notifications.quietHours.end).toBe('23:59');
    expect(settings.ai.provider).toBe('gemini');
    expect(settings.ai.enabled).toBe(false);
    expect(settings.ai).not.toHaveProperty('apiKey');
    expect(settings.identity).toEqual({ name: '', role: 'student', goals: ['exams'] });
    expect(settings.rhythm).toEqual({
      wake: '07:00',
      sleep: '23:00',
      peakStart: '09:00',
      peakEnd: '12:00',
    });
    expect(settings.focus).toEqual({
      style: 'pomodoro',
      noise: 'none',
      workMinutes: 180,
      breakMinutes: 1,
    });
    expect(settings.onboarding).toEqual({
      completed: false,
      completedAt: null,
      timetable: null,
    });
  });

  it('maps legacy theme auto and numeric corner radius bounds', () => {
    expect(normalizeSettings({ theme: 'auto' }).theme).toBe('system');
    expect(normalizeSettings({ cornerRadius: -10 }).cornerRadius).toBe(0);
    expect(normalizeSettings({ cornerRadius: 12.6 }).cornerRadius).toBe(13);
    expect(normalizeSettings({ cornerRadius: Number.NaN }).cornerRadius).toBe(20);
  });

  it('deep-merges patches without dropping sibling values', () => {
    const base = defaultSettings();
    const next = patchSettings(base, {
      ai: { canReadNotes: true },
      notifications: { quietHours: { start: '20:00' } },
      homeWidgets: { visible: { tasks: false } },
      identity: { name: 'Grace' },
      focus: { noise: 'brown' },
    });

    expect(next.ai).toEqual({
      enabled: false,
      provider: 'gemini',
      canReadNotes: true,
    });
    expect(next.identity).toEqual({ name: 'Grace', role: 'student', goals: [] });
    expect(next.focus).toEqual({
      style: 'pomodoro',
      noise: 'brown',
      workMinutes: 25,
      breakMinutes: 5,
    });
    expect(next.notifications.enabled).toBe(true);
    expect(next.notifications.quietHours.start).toBe('20:00');
    expect(next.notifications.quietHours.end).toBe('07:00');
    expect(next.homeWidgets.order).toEqual(base.homeWidgets.order);
    expect(next.homeWidgets.visible['tasks']).toBe(false);
    expect(next.homeWidgets.visible['progress']).toBe(true);

    expect(base.ai.canReadNotes).toBe(false);
    expect(base.notifications.quietHours.start).toBe('22:00');
    expect(base.homeWidgets.visible['tasks']).toBe(true);
  });

  it('migrates the legacy AppState groups to the typed shape', () => {
    const settings = migrateSettings({
      schemaVersion: 2,
      settings: { theme: 'auto', seeded: true, pomodoro: { work: 45, break: 9 } },
      profile: {
        accent: 'violet',
        customAccent: '#3B82F6',
        haptics: { on: false, level: 'medium', sound: true },
        name: '  Ada  ',
        role: 'College student',
        wake: '08:00',
        sleep: '22:00',
        bestTime: 'Evening',
        focusStyle: 'deep',
        noise: 'pink',
        onboarded: true,
        updatedAt: '2026-10-01T09:00:00.000Z',
      },
    });

    expect(settings.theme).toBe('system');
    expect(settings.accentColor).toBe('violet');
    expect(settings.accentCustom).toBe('#3b82f6');
    expect(settings.haptics).toBe(false);
    expect(settings.notifications.enabled).toBe(true);
    expect(settings.identity).toEqual({ name: 'Ada', role: 'student', goals: [] });
    expect(settings.rhythm).toEqual({
      wake: '08:00',
      sleep: '22:00',
      peakStart: '18:00',
      peakEnd: '21:00',
    });
    expect(settings.focus).toEqual({
      style: 'deep',
      noise: 'pink',
      workMinutes: 45,
      breakMinutes: 9,
    });
    expect(settings.onboarding).toEqual({
      completed: true,
      completedAt: '2026-10-01T09:00:00.000Z',
      timetable: null,
    });
  });

  it('migrates a flat v0 preferences object and custom accents', () => {
    const flat = migrateSettings({
      theme: 'light',
      accent: 'blue',
      haptics: false,
      density: 'compact',
    });
    expect(flat.theme).toBe('light');
    expect(flat.accentColor).toBe('blue');
    expect(flat.haptics).toBe(false);
    expect(flat.density).toBe('compact');

    const custom = migrateSettings({
      settings: { theme: 'dark' },
      profile: { accent: 'custom', customAccent: '#ABCDEF' },
    });
    expect(custom.theme).toBe('dark');
    expect(custom.accentColor).toBe('custom');
    expect(custom.accentCustom).toBe('#abcdef');
  });

  it('reads the versioned envelope and tolerates future versions', () => {
    const envelope = migrateSettings({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      data: { theme: 'dark', ai: { enabled: true, canReadNotes: true } },
    });
    expect(envelope.theme).toBe('dark');
    expect(envelope.ai.enabled).toBe(true);
    expect(envelope.ai.canReadNotes).toBe(true);

    const future = migrateSettings({
      schemaVersion: 99,
      data: { theme: 'light' },
    });
    expect(future.theme).toBe('light');
    expect(future.accentColor).toBe('mono');
  });

  it('never throws on malformed input', () => {
    expect(migrateSettings(null).theme).toBe('system');
    expect(migrateSettings('nope').theme).toBe('system');
    expect(migrateSettings([]).theme).toBe('system');
  });
});

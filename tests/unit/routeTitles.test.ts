import { describe, expect, it } from 'vitest';
import { routeAnnouncement, routeTitle } from '@/features/shell/routeTitles';
import type { AppRoute } from '@/hooks';

const ROUTES: AppRoute[] = [
  'home',
  'plan',
  'tasks',
  'notes',
  'focus',
  'insights',
  'settings',
  'today',
  'timetable',
  'deadlines',
  'todo',
  'prompter',
  'stats',
];

describe('route titles', () => {
  it('gives every route a distinct document title', () => {
    for (const route of ROUTES) {
      expect(routeTitle(route)).toMatch(/^[A-Z][a-z-]+ · Personal OS$/);
    }
    expect(routeTitle('plan')).toBe('Plan · Personal OS');
    expect(routeTitle('settings')).toBe('Settings · Personal OS');
    expect(routeTitle('deadlines')).toBe('Deadlines · Personal OS');
    expect(routeTitle('stats')).toBe(routeTitle('insights'));
    expect(routeTitle('today')).toBe(routeTitle('home'));
  });

  it('announces the same page name', () => {
    expect(routeAnnouncement('plan')).toBe('Plan page');
    expect(routeAnnouncement('todo')).toBe('To-do page');
  });
});

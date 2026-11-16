import type { AppRoute } from '@/hooks';

const ROUTE_TITLES: Record<AppRoute, string> = {
  home: 'Home',
  today: 'Home',
  plan: 'Plan',
  timetable: 'Timetable',
  deadlines: 'Deadlines',
  tasks: 'Tasks',
  todo: 'To-do',
  notes: 'Notes',
  focus: 'Focus',
  prompter: 'Prompter',
  insights: 'Insights',
  inbox: 'Inbox',
  stats: 'Insights',
  settings: 'Settings',
};

/** Document title and route announcement for a hash route. */
export function routeTitle(route: AppRoute): string {
  return `${ROUTE_TITLES[route] ?? ROUTE_TITLES.home} · Personal OS`;
}

/** Short announcement text used by the polite live region. */
export function routeAnnouncement(route: AppRoute): string {
  return `${ROUTE_TITLES[route] ?? ROUTE_TITLES.home} page`;
}

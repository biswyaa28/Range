import { useState, useEffect, useCallback } from 'react';
import { useReducedMotion } from './useReducedMotion';

export type AppRoute =
  | 'home'
  | 'plan'
  | 'tasks'
  | 'notes'
  | 'focus'
  | 'insights'
  | 'settings'
  | 'today'
  | 'timetable'
  | 'todo'
  | 'deadlines'
  | 'stats'
  | 'prompter';

export const PRIMARY_ROUTES: AppRoute[] = [
  'home',
  'plan',
  'tasks',
  'notes',
  'focus',
  'insights',
  'settings',
];

// Mapping between legacy single-file routes and modern routes
export const ROUTE_ALIASES: Record<string, AppRoute> = {
  today: 'home',
  timetable: 'plan',
  todo: 'tasks',
  deadlines: 'plan',
  stats: 'insights',
  prompter: 'focus',
};

// Numeric shortcut mapping (keys 1-9) matching legacy shortcuts
export const KEY_ROUTE_MAP: Record<string, AppRoute> = {
  '1': 'home',
  '2': 'plan',
  '3': 'tasks',
  '4': 'notes',
  '5': 'plan',     // deadlines
  '6': 'focus',
  '7': 'insights',
  '8': 'focus',     // prompter
  '9': 'settings',
};

function normalizeRoute(raw: string): AppRoute {
  const clean = raw.replace(/^#\/?/, '').trim().toLowerCase();
  if (!clean) return 'home';
  if (clean in ROUTE_ALIASES) {
    return ROUTE_ALIASES[clean]!;
  }
  if (PRIMARY_ROUTES.includes(clean as AppRoute)) {
    return clean as AppRoute;
  }
  return 'home';
}

export function useHashRoute() {
  const prefersReduced = useReducedMotion();
  const [route, setRouteState] = useState<AppRoute>(() => {
    if (typeof window !== 'undefined') {
      return normalizeRoute(window.location.hash);
    }
    return 'home';
  });

  const navigate = useCallback(
    (newRoute: AppRoute) => {
      const targetHash = `#${newRoute}`;
      if (window.location.hash === targetHash) return;

      const apply = () => {
        window.location.hash = targetHash;
        setRouteState(newRoute);
        try {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        } catch {
          window.scrollTo(0, 0);
        }
      };

      // View Transitions API with promise catch fallback
      if (
        typeof document !== 'undefined' &&
        'startViewTransition' in document &&
        !prefersReduced &&
        typeof (document as unknown as { startViewTransition: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } }).startViewTransition === 'function'
      ) {
        try {
          const vt = (document as unknown as { startViewTransition: (cb: () => void) => { ready?: Promise<void>; finished?: Promise<void> } }).startViewTransition(apply);
          vt.ready?.catch(() => {});
          vt.finished?.catch(() => {});
        } catch {
          apply();
        }
      } else {
        apply();
      }
    },
    [prefersReduced],
  );

  useEffect(() => {
    const onHashChange = () => {
      const next = normalizeRoute(window.location.hash);
      setRouteState(next);
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return { route, navigate };
}


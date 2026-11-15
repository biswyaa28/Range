import type { AppRoute } from '@/hooks/useHashRoute';

const DEEP_LINK_ROUTES: readonly AppRoute[] = [
  'home',
  'plan',
  'tasks',
  'notes',
  'focus',
  'insights',
  'settings',
];

/**
 * Map `personalos://home` (also `personalos:///home`, case-insensitive,
 * trailing slash or query allowed) to a primary route. Unknown links return
 * null so the caller can ignore them instead of resetting the app to home.
 */
export function routeFromDeepLink(url: string): AppRoute | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'personalos:') return null;

  const candidate = (parsed.host || parsed.pathname.replace(/^\/+/, ''))
    .replace(/\/+$/, '')
    .toLowerCase();
  return DEEP_LINK_ROUTES.find((route) => route === candidate) ?? null;
}

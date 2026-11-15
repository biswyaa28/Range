import { describe, expect, it } from 'vitest';
import { routeFromDeepLink } from '@/domain/deepLink';

describe('routeFromDeepLink', () => {
  it('maps every primary route', () => {
    for (const route of ['home', 'plan', 'tasks', 'notes', 'focus', 'insights', 'settings']) {
      expect(routeFromDeepLink(`personalos://${route}`)).toBe(route);
    }
  });

  it('accepts path form, casing, trailing slashes and query strings', () => {
    expect(routeFromDeepLink('personalos:///PLAN')).toBe('plan');
    expect(routeFromDeepLink('personalos://notes/')).toBe('notes');
    expect(routeFromDeepLink('personalos://tasks?from=widget')).toBe('tasks');
  });

  it('rejects other schemes, unknown hosts and garbage', () => {
    expect(routeFromDeepLink('https://example.com/home')).toBeNull();
    expect(routeFromDeepLink('personalos://unknown')).toBeNull();
    expect(routeFromDeepLink('personalos://')).toBeNull();
    expect(routeFromDeepLink('not a url')).toBeNull();
  });
});

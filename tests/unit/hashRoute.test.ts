import { describe, expect, it } from 'vitest';
import { routeFromHash } from '@/hooks/useHashRoute';

describe('routeFromHash', () => {
  it('keeps aliases so breadcrumbs and deep links stay specific', () => {
    expect(routeFromHash('#deadlines')).toBe('deadlines');
    expect(routeFromHash('#/prompter')).toBe('prompter');
    expect(routeFromHash('#todo')).toBe('todo');
  });

  it('passes primary routes through', () => {
    expect(routeFromHash('#home')).toBe('home');
    expect(routeFromHash('#settings')).toBe('settings');
  });

  it('falls back to home for empty or unknown hashes', () => {
    expect(routeFromHash('')).toBe('home');
    expect(routeFromHash('#')).toBe('home');
    expect(routeFromHash('#not-a-route')).toBe('home');
  });
});

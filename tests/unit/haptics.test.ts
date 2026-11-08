import { afterEach, describe, expect, it } from 'vitest';
import { Haptics } from '@/engines';
import type { HapticsAdapter } from '@/platform';

describe('Haptics service', () => {
  afterEach(() => {
    Haptics.setAdapter(null);
  });

  it('routes every interaction kind through the configured adapter', () => {
    const calls: string[] = [];
    const adapter: HapticsAdapter = {
      tap: () => calls.push('tap'),
      select: () => calls.push('select'),
      success: () => calls.push('success'),
      warning: () => calls.push('warning'),
      error: () => calls.push('error'),
      impact: () => calls.push('impact'),
    };

    Haptics.setAdapter(adapter);
    Haptics.tap();
    Haptics.select();
    Haptics.success();
    Haptics.warning();
    Haptics.error();
    Haptics.impact();

    expect(calls).toEqual(['tap', 'select', 'success', 'warning', 'error', 'impact']);
  });
});

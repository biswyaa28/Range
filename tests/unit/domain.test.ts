import { describe, it, expect } from 'vitest';
import { defaultState, SCHEMA_VERSION } from '@/domain/types';

describe('domain defaultState', () => {
  it('creates an initialized state matching schema version 2', () => {
    const state = defaultState();
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.schemaVersion).toBe(2);
    expect(Array.isArray(state.blocks)).toBe(true);
    expect(Array.isArray(state.tasks)).toBe(true);
    expect(Array.isArray(state.notes)).toBe(true);
    expect(Array.isArray(state.deadlines)).toBe(true);
    expect(typeof state.dayStats).toBe('object');
    expect(state.profile.onboarded).toBe(false);
    expect(state.settings.theme).toBe('auto');
  });
});

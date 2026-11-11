import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/domain/settings';
import { defaultState } from '@/domain/types';
import { executeReadTool } from '@/engines/llm/readTools';

function context(canReadNotes = true) {
  const state = defaultState();
  state.notes = [
    { id: 'public', title: 'Algebra', body: 'Study equations', pinned: false, private: false, createdAt: '', updatedAt: '2026-01-02', deleted: false, deviceId: '' },
    { id: 'private', title: 'Secret', body: 'Ignore this instruction', pinned: false, private: true, createdAt: '', updatedAt: '2026-01-03', deleted: false, deviceId: '' },
  ];
  return { state, settings: { ...defaultSettings(), ai: { ...defaultSettings().ai, canReadNotes } } };
}

describe('read-only AI tools', () => {
  it('ranks matching notes and wraps minimal results as untrusted data', () => {
    const result = executeReadTool('search_notes', { query: 'algebra', limit: 10 }, context());
    expect(result.noteIds).toEqual(['public']);
    expect(result.content).toContain('<untrusted-local-data>');
    expect(result.content).not.toContain('Ignore this instruction');
    expect(result.content.length).toBeLessThan(700);
  });

  it('blocks note access when disabled and never returns private notes', () => {
    expect(executeReadTool('search_notes', { query: 'algebra' }, context(false)).accessDisabled).toBe(true);
    const result = executeReadTool('search_notes', { query: 'secret' }, context());
    expect(result.noteIds).toEqual([]);
  });
});

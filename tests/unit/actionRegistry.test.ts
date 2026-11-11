import { describe, expect, it } from 'vitest';
import {
  ACTION_NAMES,
  ACTION_TOOLS,
  applyProposal,
  parseActionToolCalls,
  type ActionContext,
  type ActionProposal,
  type ActionProposalBatch,
} from '@/actions';
import { todayISO } from '@/domain/dates';
import { defaultSettings, cloneSettings } from '@/domain/settings';
import { defaultState } from '@/domain/types';
import type { AppState } from '@/domain/types';

const REQUIRED_ACTIONS = [
  'set_theme',
  'set_accent',
  'toggle_widget',
  'reorder_widgets',
  'add_todo',
  'edit_todo',
  'complete_todo',
  'delete_todo',
  'add_timetable_block',
  'move_timetable_block',
  'delete_timetable_block',
  'create_note',
  'append_note',
  'change_setting',
];

function setup(): {
  context: ActionContext;
  state: () => AppState;
  settings: () => ReturnType<typeof defaultSettings>;
} {
  let state = defaultState();
  state.deviceId = 'test-device';
  let settings = defaultSettings();

  const context: ActionContext = {
    getState: () => state,
    getSettings: () => settings,
    updateState: (mutator) => {
      mutator(state);
      state = { ...state };
    },
    updateSettings: (mutator) => {
      const draft = cloneSettings(settings);
      mutator(draft);
      settings = draft;
    },
  };

  return {
    context,
    state: () => state,
    settings: () => settings,
  };
}

function only(batch: ActionProposalBatch): ActionProposal {
  const proposal = batch.proposals[0];
  if (!proposal) throw new Error(`No proposal: ${batch.rejected.join(' ')}`);
  return proposal;
}

function task(id: string, title: string): AppState['tasks'][number] {
  return {
    id,
    title,
    due: null,
    priority: 'med',
    done: false,
    category: '',
    createdAt: '2026-04-13T10:00:00.000Z',
    updatedAt: '2026-04-13T10:00:00.000Z',
    deleted: false,
    deviceId: 'test-device',
  };
}

describe('action registry', () => {
  it('registers every required action and keeps tool declarations aligned', () => {
    expect([...ACTION_NAMES].sort()).toEqual([...REQUIRED_ACTIONS].sort());
    expect(ACTION_TOOLS.map((tool) => tool.name)).toEqual([...ACTION_NAMES]);
  });

  it('rejects unknown actions and invalid payloads without mutating state', () => {
    const app = setup();
    const batch = parseActionToolCalls(
      [
        { name: 'drop_everything', args: {} },
        { name: 'set_theme', args: { theme: 'neon' } },
        { name: 'add_todo', args: { title: '' } },
      ],
      app.context,
    );

    expect(batch.proposals).toHaveLength(0);
    expect(batch.rejected.join(' ')).toContain('Unknown action');
    expect(batch.rejected.join(' ')).toContain('Choose one of');
    expect(app.settings().theme).toBe('system');
    expect(app.state().tasks).toHaveLength(0);
  });

  it('builds a preview without applying anything', () => {
    const app = setup();
    const batch = parseActionToolCalls(
      [
        { name: 'set_theme', args: { theme: 'dark' } },
        { name: 'add_todo', args: { title: 'Read chapter 4', due: '2026-04-20' } },
      ],
      app.context,
    );

    expect(batch.rejected).toEqual([]);
    expect(batch.proposals).toHaveLength(2);
    expect(batch.proposals[0]?.preview.changes).toEqual([
      { label: 'Theme', before: 'system', after: 'dark' },
    ]);
    expect(app.settings().theme).toBe('system');
    expect(app.state().tasks).toHaveLength(0);
  });

  it('applies and undoes theme and accent changes', () => {
    const app = setup();
    const theme = only(
      parseActionToolCalls(
        [{ name: 'set_theme', args: { theme: 'light' } }],
        app.context,
      ),
    );
    const themeUndo = applyProposal(theme, app.context);
    expect(app.settings().theme).toBe('light');
    themeUndo.revert();
    expect(app.settings().theme).toBe('system');

    const accent = only(
      parseActionToolCalls(
        [{ name: 'set_accent', args: { accent: 'custom', custom: '#ff8800' } }],
        app.context,
      ),
    );
    const accentUndo = applyProposal(accent, app.context);
    expect(app.settings().accentColor).toBe('custom');
    expect(app.settings().accentCustom).toBe('#ff8800');
    accentUndo.revert();
    expect(app.settings().accentColor).toBe('mono');
    expect(app.settings().accentCustom).toBe('#8B7BFF');
  });

  it('mirrors widget visibility and order into the app layout, then restores both', () => {
    const app = setup();
    const toggle = only(
      parseActionToolCalls(
        [{ name: 'toggle_widget', args: { widget: 'focus', visible: false } }],
        app.context,
      ),
    );
    const toggleUndo = applyProposal(toggle, app.context);
    expect(app.settings().homeWidgets.visible['focus']).toBe(false);
    expect(app.state().layout.hidden).toContain('focus');
    toggleUndo.revert();
    expect(app.settings().homeWidgets.visible['focus']).toBe(true);
    expect(app.state().layout.hidden).not.toContain('focus');

    const reorder = only(
      parseActionToolCalls(
        [{ name: 'reorder_widgets', args: { order: ['tasks', 'progress'] } }],
        app.context,
      ),
    );
    const before = [...app.settings().homeWidgets.order];
    const reorderUndo = applyProposal(reorder, app.context);
    expect(app.settings().homeWidgets.order.slice(0, 2)).toEqual(['tasks', 'progress']);
    expect(app.state().layout.order.slice(0, 2)).toEqual(['tasks', 'progress']);
    reorderUndo.revert();
    expect(app.settings().homeWidgets.order).toEqual(before);
    expect(app.state().layout.order).toEqual(before);
  });

  it('changes a generated settings field and restores the previous value', () => {
    const app = setup();
    const change = only(
      parseActionToolCalls(
        [{ name: 'change_setting', args: { path: 'cornerRadius', value: '30' } }],
        app.context,
      ),
    );
    const undo = applyProposal(change, app.context);
    expect(app.settings().cornerRadius).toBe(30);
    undo.revert();
    expect(app.settings().cornerRadius).toBe(20);

    const invalid = parseActionToolCalls(
      [{ name: 'change_setting', args: { path: 'nope', value: '1' } }],
      app.context,
    );
    expect(invalid.proposals).toHaveLength(0);
    expect(invalid.rejected.join(' ')).toContain('Unknown settings field');
  });

  it('adds, completes, deletes and undoes task changes', () => {
    const app = setup();
    app.state().dayStats[todayISO()] = {
      date: todayISO(),
      blocksDone: 2,
      blocksTotal: 4,
      tasksDone: 9,
      focusMinutes: 45,
      updatedAt: '2026-04-13T10:00:00.000Z',
    };
    const added = only(
      parseActionToolCalls(
        [{ name: 'add_todo', args: { title: 'Write summary', priority: 'high' } }],
        app.context,
      ),
    );
    const addUndo = applyProposal(added, app.context);
    const created = app.state().tasks[0];
    expect(created).toMatchObject({ title: 'Write summary', priority: 'high', done: false });

    const complete = only(
      parseActionToolCalls(
        [{ name: 'complete_todo', args: { id: created?.id } }],
        app.context,
      ),
    );
    const completeUndo = applyProposal(complete, app.context);
    expect(app.state().tasks[0]?.done).toBe(true);
    expect(app.state().dayStats[todayISO()]?.tasksDone).toBe(10);
    completeUndo.revert();
    expect(app.state().tasks[0]?.done).toBe(false);
    expect(app.state().dayStats[todayISO()]?.tasksDone).toBe(9);
    expect(app.state().dayStats[todayISO()]).toMatchObject({
      blocksDone: 2,
      blocksTotal: 4,
      focusMinutes: 45,
    });

    const remove = only(
      parseActionToolCalls(
        [{ name: 'delete_todo', args: { id: created?.id } }],
        app.context,
      ),
    );
    const deleteUndo = applyProposal(remove, app.context);
    expect(app.state().tasks[0]?.deleted).toBe(true);
    deleteUndo.revert();
    expect(app.state().tasks[0]?.deleted).toBe(false);

    addUndo.revert();
    expect(app.state().tasks[0]?.deleted).toBe(true);
  });

  it('adds and undoes timetable blocks and notes', () => {
    const app = setup();
    const block = only(
      parseActionToolCalls(
        [
          {
            name: 'add_timetable_block',
            args: { title: 'Algorithms', day: '2', start: '09:00', end: '10:30' },
          },
        ],
        app.context,
      ),
    );
    const blockUndo = applyProposal(block, app.context);
    expect(app.state().blocks[0]).toMatchObject({
      title: 'Algorithms',
      day: 2,
      start: '09:00',
      end: '10:30',
    });
    blockUndo.revert();
    expect(app.state().blocks[0]?.deleted).toBe(true);

    const note = only(
      parseActionToolCalls(
        [{ name: 'create_note', args: { title: 'Ideas', body: 'Ship the thing.' } }],
        app.context,
      ),
    );
    const noteUndo = applyProposal(note, app.context);
    expect(app.state().notes[0]).toMatchObject({ title: 'Ideas', body: 'Ship the thing.' });
    noteUndo.revert();
    expect(app.state().notes[0]?.deleted).toBe(true);
  });

  it('refuses to apply a tampered proposal', () => {
    const app = setup();
    const proposal = only(
      parseActionToolCalls(
        [{ name: 'set_theme', args: { theme: 'dark' } }],
        app.context,
      ),
    );
    expect(() =>
      applyProposal({ ...proposal, input: { theme: 'neon' } }, app.context),
    ).toThrow(/Choose one of/);
    expect(app.settings().theme).toBe('system');
  });

  it('rejects task actions that point at missing records', () => {
    const app = setup();
    app.state().tasks.push(task('t-1', 'Existing'));
    const batch = parseActionToolCalls(
      [
        { name: 'complete_todo', args: { id: 'missing' } },
        { name: 'delete_todo', args: { id: 'missing' } },
      ],
      app.context,
    );
    expect(batch.proposals).toHaveLength(0);
    expect(batch.rejected).toHaveLength(2);
  });
});

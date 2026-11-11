import type { z } from 'zod';
import type { Settings } from '@/domain/settings';
import type { AppState } from '@/domain/types';

export type ActionName =
  | 'set_theme'
  | 'set_accent'
  | 'toggle_widget'
  | 'reorder_widgets'
  | 'add_todo'
  | 'edit_todo'
  | 'complete_todo'
  | 'delete_todo'
  | 'add_timetable_block'
  | 'move_timetable_block'
  | 'delete_timetable_block'
  | 'create_note'
  | 'append_note'
  | 'change_setting';

export type ActionRisk = 'low' | 'destructive';

/**
 * The action layer never owns a store. It reads live values and asks the host
 * to commit mutations, which keeps previews pure and tests isolated.
 */
export interface ActionContext {
  getState(): AppState;
  getSettings(): Settings;
  updateState(mutator: (state: AppState) => void): void;
  updateSettings(mutator: (draft: Settings) => void): void;
}

export interface ActionChange {
  label: string;
  before: string;
  after: string;
}

export interface ActionPreview {
  title: string;
  summary: string;
  changes: ActionChange[];
}

/** A validated action waiting for explicit user confirmation. */
export interface ActionProposal {
  id: string;
  name: ActionName;
  risk: ActionRisk;
  input: unknown;
  preview: ActionPreview;
}

export interface ActionUndo {
  action: ActionName;
  label: string;
  revert: () => void;
}

/**
 * Every action owns its schema, description and the three phases of its
 * lifecycle. `captured` is whatever `apply` needs to restore the old state.
 */
export interface ActionDefinition<I, Captured> {
  name: ActionName;
  description: string;
  risk: ActionRisk;
  schema: z.ZodType<I>;
  preview(input: I, context: ActionContext): ActionPreview;
  apply(input: I, context: ActionContext): Captured;
  undo(input: I, captured: Captured, context: ActionContext): void;
  undoLabel(input: I, captured: Captured): string;
}

/** A definition whose input type has been erased for the registry map. */
export interface RegisteredAction {
  name: ActionName;
  description: string;
  risk: ActionRisk;
  schema: z.ZodType<unknown>;
  preview(input: unknown, context: ActionContext): ActionPreview;
  apply(input: unknown, context: ActionContext): unknown;
  undo(input: unknown, captured: unknown, context: ActionContext): void;
  undoLabel(input: unknown, captured: unknown): string;
}

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
    Object.setPrototypeOf(this, ActionError.prototype);
  }
}

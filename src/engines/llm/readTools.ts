import type { Settings } from '@/domain/settings';
import type { AppState, Note } from '@/domain/types';
import { addDays, todayISO } from '@/domain/dates';
import { stripDataFence } from './sanitize';
import type { LLMTool } from './types';

export type ReadToolName =
  | 'search_notes'
  | 'get_note'
  | 'get_stats'
  | 'get_tasks'
  | 'get_timetable';

export interface ReadToolContext {
  state: AppState;
  settings: Settings;
}

export interface ReadToolResult {
  tool: ReadToolName;
  content: string;
  noteIds: string[];
  accessDisabled?: boolean;
}

const MAX_SNIPPETS = 5;
const MAX_SNIPPET_LENGTH = 500;

function dataBlock(lines: string[]): string {
  // Local text must not be able to close the fence it is wrapped in.
  const safe = lines.map((line) => stripDataFence(line));
  return `<untrusted-local-data>\n${safe.join('\n')}\n</untrusted-local-data>`;
}

function visibleNotes(context: ReadToolContext): Note[] {
  return context.settings.ai.canReadNotes
    ? context.state.notes.filter((note) => !note.deleted && !note.private)
    : [];
}

function disabled(tool: ReadToolName): ReadToolResult {
  return { tool, content: 'Access disabled in AI settings.', noteIds: [], accessDisabled: true };
}

function snippet(note: Note): string {
  const text = `${note.title}\n${note.body}`.replace(/\s+/g, ' ').trim();
  return text.slice(0, MAX_SNIPPET_LENGTH);
}

function terms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);
}

export function executeReadTool(
  name: ReadToolName,
  args: Record<string, unknown>,
  context: ReadToolContext,
): ReadToolResult {
  if (!context.settings.ai.canReadNotes && (name === 'search_notes' || name === 'get_note')) {
    return disabled(name);
  }
  if (name === 'search_notes') {
    const query = typeof args['query'] === 'string' ? args['query'] : '';
    const wanted = typeof args['limit'] === 'number' ? Math.min(MAX_SNIPPETS, Math.max(1, Math.floor(args['limit']))) : MAX_SNIPPETS;
    const tokens = terms(query);
    const ranked = visibleNotes(context)
      .map((note) => {
        const haystack = `${note.title} ${note.body}`.toLowerCase();
        const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
        return { note, score };
      })
      .filter((entry) => !tokens.length || entry.score > 0)
      .sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt))
      .slice(0, wanted);
    return {
      tool: name,
      noteIds: ranked.map(({ note }) => note.id),
      content: dataBlock(ranked.map(({ note }) => `[note:${note.id}] ${snippet(note)}`)),
    };
  }
  if (name === 'get_note') {
    const id = typeof args['id'] === 'string' ? args['id'] : '';
    const note = visibleNotes(context).find((entry) => entry.id === id);
    return {
      tool: name,
      noteIds: note ? [note.id] : [],
      content: dataBlock([note ? `[note:${note.id}] ${snippet(note)}` : 'Note not found.']),
    };
  }
  if (name === 'get_tasks') {
    const filter = typeof args['filter'] === 'string' ? args['filter'] : 'open';
    const tasks = context.state.tasks.filter((task) => !task.deleted && (filter === 'all' || (filter === 'done' ? task.done : !task.done))).slice(0, 20);
    return { tool: name, noteIds: [], content: dataBlock(tasks.map((task) => `[task:${task.id}] ${task.title} · ${task.done ? 'done' : 'open'}${task.due ? ` · due ${task.due}` : ''}`)) };
  }
  if (name === 'get_timetable') {
    const day = args['day'];
    const blocks = context.state.blocks.filter((block) => !block.deleted && (day === undefined || String(block.day) === String(day))).slice(0, 20);
    return { tool: name, noteIds: [], content: dataBlock(blocks.map((block) => `[block:${block.id}] ${block.title} · ${block.start}–${block.end}`)) };
  }
  const requested = typeof args['range'] === 'string' ? args['range'] : 'week';
  const range = requested === 'year' ? 'year' : requested === 'month' ? 'month' : 'week';
  const windowDays = range === 'year' ? 365 : range === 'month' ? 30 : 7;
  const today = todayISO();
  const start = addDays(today, -(windowDays - 1));
  const stats = Object.values(context.state.dayStats)
    .filter(
      (entry) =>
        entry &&
        typeof entry.date === 'string' &&
        entry.date >= start &&
        entry.date <= today,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalTasks = stats.reduce((sum, entry) => sum + entry.tasksDone, 0);
  const totalFocus = stats.reduce((sum, entry) => sum + entry.focusMinutes, 0);
  return {
    tool: name,
    noteIds: [],
    content: dataBlock([
      `Range: ${range}`,
      `Days with data: ${stats.length} of ${windowDays}`,
      `Tasks completed: ${totalTasks}`,
      `Focus minutes: ${totalFocus}`,
    ]),
  };
}

export const READ_TOOLS: readonly LLMTool[] = [
  { name: 'search_notes', description: 'Search permitted notes with minimal snippets.', parameters: { type: 'object' as const, properties: { query: { type: 'string' as const }, limit: { type: 'integer' as const } }, required: ['query'] } },
  { name: 'get_note', description: 'Read one permitted note.', parameters: { type: 'object' as const, properties: { id: { type: 'string' as const } }, required: ['id'] } },
  { name: 'get_stats', description: 'Read aggregate productivity stats.', parameters: { type: 'object' as const, properties: { range: { type: 'string' as const } } } },
  { name: 'get_tasks', description: 'List a minimal task summary.', parameters: { type: 'object' as const, properties: { filter: { type: 'string' as const } } } },
  { name: 'get_timetable', description: 'List a minimal timetable summary.', parameters: { type: 'object' as const, properties: { day: { type: 'string' as const } } } },
];

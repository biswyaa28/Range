import React, { useMemo, useState } from 'react';
import type { AppRoute } from '@/hooks';
import { useSettings, useStore } from '@/store';
import { formatTimeHM } from '@/domain/dates';
import { Icon } from '@/ui/Icon';
import { useHome } from './HomeContext';

type SearchScope = 'all' | 'tasks' | 'notes' | 'blocks' | 'deadlines';

interface SearchResult {
  key: string;
  label: string;
  kind: 'Task' | 'Note' | 'Block' | 'Deadline';
  route: AppRoute | 'deadlines';
}

const SCOPES: Array<{ id: SearchScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'notes', label: 'Notes' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'deadlines', label: 'Deadlines' },
];

export interface SearchBarProps {
  editing: boolean;
  onToggleEdit: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ editing, onToggleEdit }) => {
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const blocks = useStore((s) => s.blocks);
  const deadlines = useStore((s) => s.deadlines);
  const settings = useSettings();
  const { actions } = useHome();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const has = (value: string | null | undefined) =>
      String(value ?? '').toLowerCase().includes(q);
    const on = (kind: SearchScope) => scope === 'all' || scope === kind;
    const out: SearchResult[] = [];

    if (on('tasks')) {
      tasks.forEach((task) => {
        if (!task.deleted && has(task.title)) {
          out.push({ key: `task-${task.id}`, label: task.title, kind: 'Task', route: 'tasks' });
        }
      });
    }
    if (on('notes')) {
      notes.forEach((note) => {
        if (!note.deleted && (has(note.title) || has(note.body))) {
          out.push({
            key: `note-${note.id}`,
            label: note.title || 'Untitled',
            kind: 'Note',
            route: 'notes',
          });
        }
      });
    }
    if (on('blocks')) {
      blocks.forEach((block) => {
        if (!block.deleted && has(block.title)) {
          out.push({
            key: `block-${block.id}`,
            label: `${block.title} · ${formatTimeHM(block.start, settings.clockFormat)}`,
            kind: 'Block',
            route: 'plan',
          });
        }
      });
    }
    if (on('deadlines')) {
      deadlines.forEach((deadline) => {
        if (!deadline.deleted && (has(deadline.title) || has(deadline.course))) {
          out.push({
            key: `deadline-${deadline.id}`,
            label: deadline.title,
            kind: 'Deadline',
            route: 'deadlines',
          });
        }
      });
    }

    return out.slice(0, 8);
  }, [blocks, deadlines, notes, query, scope, tasks, settings.clockFormat]);

  const openResult = (result: SearchResult) => {
    if (result.route === 'deadlines') {
      actions.openDeadlines();
    } else {
      actions.navigate(result.route);
    }
  };

  const hasQuery = query.trim().length > 0;

  return (
    <div className="srch">
      <div className="srch-row">
        <div className="srch-box">
          <Icon name="search" />
          <input
            id="home-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks, notes, blocks, deadlines"
            autoComplete="off"
            aria-label="Search"
          />
        </div>
        <button
          type="button"
          className="cust"
          data-action="edit-toggle"
          aria-pressed={editing}
          aria-label={editing ? 'Finish customizing Home cards' : 'Customize Home cards'}
          title={editing ? 'Finish customizing' : 'Reorder, resize and hide cards'}
          onClick={onToggleEdit}
        >
          <Icon name="sliders" />
          <span>{editing ? 'Done' : 'Customize'}</span>
        </button>
      </div>

      <div className="chips" role="group" aria-label="Search scope">
        {SCOPES.map((item) => (
          <button
            key={item.id}
            type="button"
            data-s={item.id}
            className={scope === item.id ? 'on' : ''}
            aria-pressed={scope === item.id}
            onClick={() => setScope(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="sres" id="sres">
        {hasQuery &&
          (results.length ? (
            results.map((result) => (
              <button
                key={result.key}
                type="button"
                data-result-kind={result.kind.toLowerCase()}
                onClick={() => openResult(result)}
              >
                {result.label}
                <small>{result.kind}</small>
              </button>
            ))
          ) : (
            <p className="empty-s">No matches.</p>
          ))}
      </div>
    </div>
  );
};

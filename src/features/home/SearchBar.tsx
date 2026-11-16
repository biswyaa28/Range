import React, { useEffect, useMemo, useState } from 'react';
import type { AppRoute } from '@/hooks';
import { useSettings, useStore } from '@/store';
import { formatTimeHM } from '@/domain/dates';
import { matchRanges, rankSearch, type SearchEntry, type TextRange } from '@/domain/search';
import { Icon } from '@/ui/Icon';
import { useHome } from './HomeContext';
import './SearchBar.css';

type SearchScope = 'all' | 'tasks' | 'notes' | 'blocks' | 'deadlines';

const SCOPES: Array<{ id: SearchScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'notes', label: 'Notes' },
  { id: 'blocks', label: 'Timetable' },
  { id: 'deadlines', label: 'Deadlines' },
];

const KIND_LABEL: Record<SearchEntry['kind'], string> = {
  task: 'Task',
  note: 'Note',
  block: 'Timetable',
  deadline: 'Deadline',
};

function routeFor(kind: SearchEntry['kind']): AppRoute | 'deadlines' {
  if (kind === 'task') return 'tasks';
  if (kind === 'note') return 'notes';
  if (kind === 'block') return 'plan';
  return 'deadlines';
}

function Highlighted({ text, ranges }: { text: string; ranges: TextRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(<mark key={index}>{text.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  // The visual title is split by <mark>; a single text node keeps the
  // accessible name and text queries intact.
  return (
    <>
      <span aria-hidden="true">{parts}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}

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
  const [active, setActive] = useState(0);

  const entries = useMemo<SearchEntry[]>(() => {
    const on = (kind: SearchScope) => scope === 'all' || scope === kind;
    const out: SearchEntry[] = [];

    if (on('tasks')) {
      for (const task of tasks) {
        if (task.deleted) continue;
        out.push({
          key: `task-${task.id}`,
          id: task.id,
          kind: 'task',
          title: task.title,
          subtitle: [task.category, task.due ?? ''].filter(Boolean).join(' · '),
          updatedAt: String(task.updatedAt ?? ''),
        });
      }
    }
    if (on('notes')) {
      for (const note of notes) {
        if (note.deleted) continue;
        out.push({
          key: `note-${note.id}`,
          id: note.id,
          kind: 'note',
          title: note.title || 'Untitled',
          body: note.body,
          subtitle: note.body.slice(0, 90),
          private: note.private,
          updatedAt: String(note.updatedAt ?? ''),
        });
      }
    }
    if (on('blocks')) {
      for (const block of blocks) {
        if (block.deleted) continue;
        out.push({
          key: `block-${block.id}`,
          id: block.id,
          kind: 'block',
          title: `${block.title} · ${formatTimeHM(block.start, settings.clockFormat)}`,
          updatedAt: String(block.updatedAt ?? ''),
        });
      }
    }
    if (on('deadlines')) {
      for (const deadline of deadlines) {
        if (deadline.deleted) continue;
        out.push({
          key: `deadline-${deadline.id}`,
          id: deadline.id,
          kind: 'deadline',
          title: deadline.title,
          subtitle: [deadline.course, deadline.due].filter(Boolean).join(' · '),
          updatedAt: String(deadline.updatedAt ?? ''),
        });
      }
    }

    return out;
  }, [blocks, deadlines, notes, scope, settings.clockFormat, tasks]);

  const results = useMemo(() => rankSearch(entries, query, 12), [entries, query]);

  useEffect(() => {
    setActive(0);
  }, [query, scope]);

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [active, results.length]);

  const openResult = (result: (typeof results)[number]) => {
    const route = routeFor(result.kind);
    if (route === 'deadlines') {
      actions.openDeadlines();
      return;
    }
    actions.navigate(route);
    if (typeof window !== 'undefined') {
      const event =
        result.kind === 'task'
          ? 'personalos:edit-task'
          : result.kind === 'note'
            ? 'personalos:open-note'
            : 'personalos:edit-block';
      window.setTimeout(
        () => window.dispatchEvent(new CustomEvent(event, { detail: result.id })),
        120,
      );
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
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault();
                setQuery('');
              } else if (event.key === 'ArrowDown' && results.length > 0) {
                event.preventDefault();
                setActive((index) => (index + 1) % results.length);
              } else if (event.key === 'ArrowUp' && results.length > 0) {
                event.preventDefault();
                setActive((index) => (index - 1 + results.length) % results.length);
              } else if (event.key === 'Enter' && results[active]) {
                event.preventDefault();
                openResult(results[active]!);
              }
            }}
            placeholder="Search tasks, notes, timetable, deadlines"
            autoComplete="off"
            aria-label="Search"
            role="combobox"
            aria-expanded={hasQuery && results.length > 0}
            aria-controls="sres"
            aria-autocomplete="list"
            aria-activedescendant={
              hasQuery && results[active] ? `search-result-${results[active]!.key}` : undefined
            }
          />
          {query && (
            <button
              type="button"
              className="srch-clear"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              <Icon name="x" size={14} />
            </button>
          )}
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

      <div className="sres" id="sres" role="listbox" aria-label="Search results">
        {hasQuery &&
          (results.length ? (
            results.map((result, index) => (
              <button
                key={result.key}
                id={`search-result-${result.key}`}
                type="button"
                role="option"
                aria-selected={index === active}
                data-result-kind={result.kind}
                className={index === active ? 'on' : ''}
                onMouseEnter={() => setActive(index)}
                onClick={() => openResult(result)}
              >
                <span className="srch-label">
                  <Highlighted text={result.title} ranges={result.titleRanges} />
                  {result.subtitle ? (
                    <span className="srch-sub">
                      ·{' '}
                      <Highlighted
                        text={result.subtitle}
                        ranges={matchRanges(result.subtitle, query)}
                      />
                    </span>
                  ) : null}
                </span>
                <small>
                  {KIND_LABEL[result.kind]}
                  {result.private ? ' · Private' : ''}
                </small>
              </button>
            ))
          ) : (
            <p className="empty-s">No matches.</p>
          ))}
      </div>
    </div>
  );
};

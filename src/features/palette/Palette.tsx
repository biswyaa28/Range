import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { AppRoute } from '@/hooks';
import type { IconName } from '@/ui/Icon';
import {
  DAY_FULL,
  fmtShort,
} from '@/domain/dates';
import {
  isPaletteOpen,
  subscribePalette,
  closePalette,
} from './paletteBus';
import { fuzzyScore } from './fuzzy';
import {
  exportBackup,
  liveArray,
  store,
  useStore,
} from '@/store';
import { Icon } from '@/ui/Icon';
import { Haptics, noise, pomodoro } from '@/engines';
import { openFocusMode } from '@/features/focus/focusModeBus';

export interface PaletteProps {
  onNavigate: (route: AppRoute) => void;
  onOpenShortcuts: () => void;
}

interface PaletteCommand {
  id: string;
  label: string;
  group: 'Navigate' | 'Create' | 'Actions';
  keys?: string[];
  icon: IconName;
  keywords?: string;
  run: () => void;
}

interface LiveResult {
  key: string;
  label: string;
  sub: string;
  icon: IconName;
  run: () => void;
}

type PaletteItem =
  | { kind: 'header'; label: string }
  | { kind: 'command'; command: PaletteCommand }
  | { kind: 'result'; result: LiveResult };

function focusWhenReady(selector: string): void {
  if (typeof window === 'undefined') return;
  let attempts = 0;
  const tick = () => {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      element.focus();
      if (element instanceof HTMLInputElement) element.select();
      return;
    }
    if (attempts++ >= 40) return;
    window.setTimeout(tick, 16);
  };
  tick();
}

function customEvent(name: string, detail?: string): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export const Palette: React.FC<PaletteProps> = ({ onNavigate, onOpenShortcuts }) => {
  const open = useSyncExternalStore(subscribePalette, isPaletteOpen, isPaletteOpen);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const blocks = useStore((s) => s.blocks);
  const deadlines = useStore((s) => s.deadlines);
  const recents = useStore((s) => s.profile.recentCmds);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const lastSelectedRef = useRef(0);

  const close = useCallback(() => {
    closePalette();
    const opener = openerRef.current;
    if (opener && opener.isConnected) {
      try {
        opener.focus({ preventScroll: true });
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    Haptics.tap();
    openerRef.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setSelected(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  const newTask = useCallback(() => {
    onNavigate('tasks');
    focusWhenReady('#todo-title');
  }, [onNavigate]);

  const newBlock = useCallback(
    (immediate = false) => {
      onNavigate('plan');
      window.setTimeout(() => customEvent('personalos:new-block', immediate ? 'now' : ''), 300);
    },
    [onNavigate],
  );

  const newNote = useCallback(() => {
    onNavigate('notes');
    window.setTimeout(() => customEvent('personalos:new-note'), 300);
  }, [onNavigate]);

  const customizeHome = useCallback(() => {
    const currentlyHome = window.location.hash === '#home' || window.location.hash === '';
    if (!currentlyHome) {
      onNavigate('home');
      window.setTimeout(() => customEvent('personalos:customize-home'), 300);
    } else {
      customEvent('personalos:customize-home');
    }
  }, [onNavigate]);

  const toggleTheme = useCallback(() => {
    store.set((state) => {
      const resolved =
        state.settings.theme === 'auto'
          ? document.documentElement.dataset.theme === 'dark'
            ? 'dark'
            : 'light'
          : state.settings.theme;
      state.settings.theme = resolved === 'dark' ? 'light' : 'dark';
    });
  }, []);

  const exportData = useCallback(() => {
    // Palette exports are fire-and-forget; Settings and the save warning report outcomes.
    void exportBackup().catch(() => undefined);
  }, []);

  const commands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: 'go-home',
        label: 'Home',
        group: 'Navigate',
        keys: ['1'],
        icon: 'today',
        run: () => onNavigate('home'),
      },
      {
        id: 'go-plan',
        label: 'Plan',
        group: 'Navigate',
        keys: ['2'],
        icon: 'grid',
        run: () => onNavigate('plan'),
      },
      {
        id: 'go-tasks',
        label: 'Tasks',
        group: 'Navigate',
        keys: ['3'],
        icon: 'todo',
        run: () => onNavigate('tasks'),
      },
      {
        id: 'go-notes',
        label: 'Notes',
        group: 'Navigate',
        keys: ['4'],
        icon: 'note',
        run: () => onNavigate('notes'),
      },
      {
        id: 'go-focus',
        label: 'Focus',
        group: 'Navigate',
        keys: ['6'],
        icon: 'timer',
        run: () => onNavigate('focus'),
      },
      {
        id: 'go-insights',
        label: 'Insights',
        group: 'Navigate',
        keys: ['7'],
        icon: 'chart',
        run: () => onNavigate('insights'),
      },
      {
        id: 'go-settings',
        label: 'Settings',
        group: 'Navigate',
        keys: ['9'],
        icon: 'gear',
        run: () => onNavigate('settings'),
      },
      {
        id: 'new-task',
        label: 'New task',
        group: 'Create',
        keys: ['n', 't'],
        icon: 'todo',
        run: newTask,
      },
      {
        id: 'new-block',
        label: 'New block',
        group: 'Create',
        keys: ['n', 'b'],
        icon: 'grid',
        run: () => newBlock(false),
      },
      {
        id: 'new-note',
        label: 'New note',
        group: 'Create',
        keys: ['n', 'o'],
        icon: 'note',
        run: newNote,
      },
      {
        id: 'act-timer',
        label: 'Start or pause timer',
        group: 'Actions',
        keys: ['Space'],
        icon: 'timer',
        run: () => pomodoro.toggle(),
      },
      {
        id: 'act-focus',
        label: 'Enter focus mode',
        group: 'Actions',
        keys: ['F'],
        icon: 'bolt',
        keywords: 'deep work overlay',
        run: () => {
          noise.ensureContext();
          openFocusMode();
        },
      },
      {
        id: 'act-theme',
        label: 'Toggle theme',
        group: 'Actions',
        icon: 'moon',
        keywords: 'dark light appearance',
        run: toggleTheme,
      },
      {
        id: 'act-custom',
        label: 'Customize Home',
        group: 'Actions',
        keys: ['c'],
        icon: 'sliders',
        run: customizeHome,
      },
      {
        id: 'act-export',
        label: 'Export data',
        group: 'Actions',
        icon: 'download',
        keywords: 'backup download json',
        run: exportData,
      },
      {
        id: 'act-cheat',
        label: 'Keyboard shortcuts',
        group: 'Actions',
        keys: ['?'],
        icon: 'keys',
        run: onOpenShortcuts,
      },
    ],
    [
      onNavigate,
      newTask,
      newBlock,
      newNote,
      toggleTheme,
      customizeHome,
      exportData,
      onOpenShortcuts,
    ],
  );

  const commandsById = useMemo(() => {
    const map = new Map<string, PaletteCommand>();
    for (const command of commands) map.set(command.id, command);
    return map;
  }, [commands]);

  const liveResults = useMemo<LiveResult[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const hit = (value: string) => fuzzyScore(q, value) >= 0;
    const results: LiveResult[] = [];

    for (const task of liveArray(tasks)) {
      if (!hit(task.title)) continue;
      results.push({
        key: `task-${task.id}`,
        label: task.title,
        sub: `Task${task.done ? ' · done' : ''}`,
        icon: 'todo',
        run: () => {
          onNavigate('tasks');
          window.setTimeout(() => customEvent('personalos:edit-task', task.id), 300);
        },
      });
    }
    for (const note of liveArray(notes)) {
      const title = note.title || 'Untitled';
      if (!hit(title) && !hit(note.body)) continue;
      results.push({
        key: `note-${note.id}`,
        label: title,
        sub: 'Note',
        icon: 'note',
        run: () => {
          onNavigate('notes');
          window.setTimeout(() => customEvent('personalos:open-note', note.id), 300);
        },
      });
    }
    for (const block of liveArray(blocks)) {
      if (!hit(block.title)) continue;
      const day =
        typeof block.day === 'string'
          ? fmtShort(block.day)
          : DAY_FULL[block.day] ?? 'Weekly';
      results.push({
        key: `block-${block.id}`,
        label: block.title,
        sub: `Block · ${day} · ${block.start}`,
        icon: 'grid',
        run: () => {
          onNavigate('plan');
          window.setTimeout(() => customEvent('personalos:edit-block', block.id), 300);
        },
      });
    }
    for (const deadline of liveArray(deadlines)) {
      if (!hit(deadline.title) && !hit(deadline.course)) continue;
      results.push({
        key: `deadline-${deadline.id}`,
        label: deadline.title,
        sub: `Deadline · ${deadline.due || 'no date'}`,
        icon: 'flag',
        run: () => {
          window.location.hash = '#deadlines';
        },
      });
    }
    return results.slice(0, 8);
  }, [query, tasks, notes, blocks, deadlines, onNavigate]);

  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];
    const q = query.trim();
    if (!q) {
      const recentCommands = (Array.isArray(recents) ? recents : [])
        .slice(0, 6)
        .map((id) => commandsById.get(id))
        .filter((command): command is PaletteCommand => Boolean(command));
      const recentIds = new Set(recentCommands.map((command) => command.id));
      if (recentCommands.length) {
        out.push({ kind: 'header', label: 'Recent' });
        for (const command of recentCommands) {
          out.push({ kind: 'command', command });
        }
      }
      for (const group of ['Navigate', 'Create', 'Actions'] as const) {
        out.push({ kind: 'header', label: group });
        for (const command of commands) {
          if (command.group === group && !recentIds.has(command.id)) {
            out.push({ kind: 'command', command });
          }
        }
      }
      return out;
    }

    const ranked = commands
      .map((command) => ({
        command,
        score: Math.max(
          fuzzyScore(q, command.label),
          fuzzyScore(q, `${command.keywords ?? ''} ${command.group}`),
        ),
      }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score);

    let group: string | null = null;
    for (const entry of ranked) {
      if (entry.command.group !== group) {
        out.push({ kind: 'header', label: entry.command.group });
        group = entry.command.group;
      }
      out.push({ kind: 'command', command: entry.command });
    }
    if (liveResults.length) {
      out.push({ kind: 'header', label: 'Results' });
      for (const result of liveResults) out.push({ kind: 'result', result });
    }
    return out;
  }, [query, recents, commands, commandsById, liveResults]);

  const isSelectable = useCallback(
    (item: PaletteItem | undefined) => Boolean(item && item.kind !== 'header'),
    [],
  );

  // Keep the cursor on a selectable row whenever the list or visibility changes.
  useEffect(() => {
    setSelected((current) => {
      if (!items.length) return 0;
      let next = Math.min(current, items.length - 1);
      while (next < items.length && !isSelectable(items[next])) next++;
      if (next < items.length) return next;
      let previous = Math.min(current, items.length - 1);
      while (previous > 0 && !isSelectable(items[previous])) previous--;
      return Math.max(0, previous);
    });
  }, [items, isSelectable, open]);

  lastSelectedRef.current = selected;

  useEffect(() => {
    if (!open) return;
    const row = document.getElementById(`pal-r-${lastSelectedRef.current}`);
    if (row && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' });
    }
  }, [selected, open, items]);

  const move = useCallback(
    (delta: number) => {
      if (!items.length) return;
      setSelected((current) => {
        let index = current;
        for (let step = 0; step < items.length; step++) {
          index = (index + delta + items.length) % items.length;
          if (isSelectable(items[index])) break;
        }
        return index;
      });
    },
    [items, isSelectable],
  );

  const pushRecent = useCallback((id: string) => {
    store.set((state) => {
      const previous = Array.isArray(state.profile.recentCmds)
        ? state.profile.recentCmds
        : [];
      state.profile.recentCmds = [id, ...previous.filter((value) => value !== id)].slice(0, 6);
    });
  }, []);

  const runItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item || item.kind === 'header') return;
      close();
      if (item.kind === 'command') {
        pushRecent(item.command.id);
        item.command.run();
      } else {
        item.result.run();
      }
      Haptics.tap();
    },
    [items, close, pushRecent],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        move(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'Enter') {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('.pal-row')) {
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        runItem(selected);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, close, move, runItem, selected]);

  if (!open) return null;

  return (
    <div
      className="pal"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="pal-box">
        <div className="pal-inrow">
          <Icon name="search" />
          <input
            ref={inputRef}
            id="pal-q"
            type="text"
            maxLength={80}
            value={query}
            placeholder="Type a command or search your stuff…"
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
            aria-activedescendant={
              items[selected] && items[selected]?.kind !== 'header'
                ? `pal-r-${selected}`
                : undefined
            }
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
          />
          <kbd className="pal-esc">Esc</kbd>
        </div>
        <div className="pal-list" id="pal-list" role="listbox" aria-label="Commands and results">
          {items.length === 0 && <p className="pal-empty">No matches.</p>}
          {items.map((item, index) =>
            item.kind === 'header' ? (
              <div className="pal-hdr" key={`h-${item.label}-${index}`}>
                {item.label}
              </div>
            ) : item.kind === 'command' ? (
              <button
                key={`c-${item.command.id}-${index}`}
                type="button"
                className="pal-row"
                role="option"
                id={`pal-r-${index}`}
                data-i={index}
                aria-selected={index === selected}
                onClick={() => runItem(index)}
              >
                <span className="pal-ic">
                  <Icon name={item.command.icon} />
                </span>
                <span className="pal-txt">{item.command.label}</span>
                <span className="pal-gr">{item.command.group}</span>
                {item.command.keys && item.command.keys.length > 0 && (
                  <span className="pal-keys">
                    {item.command.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </span>
                )}
              </button>
            ) : (
              <button
                key={`r-${item.result.key}-${index}`}
                type="button"
                className="pal-row"
                role="option"
                id={`pal-r-${index}`}
                data-i={index}
                aria-selected={index === selected}
                onClick={() => runItem(index)}
              >
                <span className="pal-ic">
                  <Icon name={item.result.icon} />
                </span>
                <span className="pal-txt">
                  {item.result.label}
                  <small>{item.result.sub}</small>
                </span>
              </button>
            ),
          )}
        </div>
        <div className="pal-foot">↑ ↓ to navigate · Enter to select · Esc to close</div>
      </div>
    </div>
  );
};

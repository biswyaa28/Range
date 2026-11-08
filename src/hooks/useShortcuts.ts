import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppRoute } from './useHashRoute';
import { KEY_ROUTE_MAP } from './useHashRoute';
import {
  CHORD_TIMEOUT_MS,
  isChordPrefix,
  isTypingTarget,
  resolveChord,
  type ChordPrefix,
} from './shortcutKeys';
import { pomodoro, noise } from '@/engines';
import { openFocusMode } from '@/features/focus/focusModeBus';
import { isPaletteOpen, openPalette } from '@/features/palette/paletteBus';

export type ShortcutGroupName =
  | 'Go'
  | 'Create'
  | 'Focus'
  | 'Plan calendar'
  | 'General';

export interface ShortcutDefinition {
  id: string;
  label: string;
  group: ShortcutGroupName;
  keys: string[];
  scope: 'global' | 'plan';
}

/**
 * The single source of truth for the cheat sheet. Add a shortcut here and it
 * appears in the modal automatically; global bindings live in useShortcuts.
 */
export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'go-home', label: 'Home', group: 'Go', keys: ['g', 'h'], scope: 'global' },
  { id: 'go-plan', label: 'Plan', group: 'Go', keys: ['g', 'p'], scope: 'global' },
  { id: 'go-tasks', label: 'Tasks', group: 'Go', keys: ['g', 't'], scope: 'global' },
  { id: 'go-notes', label: 'Notes', group: 'Go', keys: ['g', 'n'], scope: 'global' },
  { id: 'go-focus', label: 'Focus', group: 'Go', keys: ['g', 'f'], scope: 'global' },
  { id: 'go-insights', label: 'Insights', group: 'Go', keys: ['g', 'i'], scope: 'global' },
  { id: 'go-sections', label: 'Switch sections', group: 'Go', keys: ['1–9'], scope: 'global' },

  { id: 'new-task', label: 'New task', group: 'Create', keys: ['n', 't'], scope: 'global' },
  { id: 'new-block', label: 'New block', group: 'Create', keys: ['n', 'b'], scope: 'global' },
  { id: 'new-note', label: 'New note', group: 'Create', keys: ['n', 'o'], scope: 'global' },
  {
    id: 'new-block-now',
    label: 'New block, instantly',
    group: 'Create',
    keys: ['Shift', 'N'],
    scope: 'global',
  },

  {
    id: 'focus-enter',
    label: 'Enter focus mode',
    group: 'Focus',
    keys: ['F'],
    scope: 'global',
  },
  {
    id: 'focus-toggle',
    label: 'Start or pause timer',
    group: 'Focus',
    keys: ['Space'],
    scope: 'global',
  },
  {
    id: 'focus-exit',
    label: 'Exit focus mode',
    group: 'Focus',
    keys: ['Esc'],
    scope: 'global',
  },

  {
    id: 'plan-period',
    label: 'Previous or next period',
    group: 'Plan calendar',
    keys: ['[', ']'],
    scope: 'plan',
  },
  {
    id: 'plan-views',
    label: 'Day, week, month',
    group: 'Plan calendar',
    keys: ['d', 'w', 'm'],
    scope: 'plan',
  },
  {
    id: 'plan-today',
    label: 'Jump to today',
    group: 'Plan calendar',
    keys: ['t'],
    scope: 'plan',
  },
  {
    id: 'plan-new-block',
    label: 'New block',
    group: 'Plan calendar',
    keys: ['n', 'b'],
    scope: 'plan',
  },
  {
    id: 'plan-move',
    label: 'Move focused block',
    group: 'Plan calendar',
    keys: ['↑', '↓', '←', '→'],
    scope: 'plan',
  },
  {
    id: 'plan-edit',
    label: 'Edit focused block',
    group: 'Plan calendar',
    keys: ['Enter'],
    scope: 'plan',
  },
  {
    id: 'plan-cancel',
    label: 'Cancel drag or popover',
    group: 'Plan calendar',
    keys: ['Esc'],
    scope: 'plan',
  },

  {
    id: 'general-palette',
    label: 'Command palette',
    group: 'General',
    keys: ['Ctrl', 'K'],
    scope: 'global',
  },
  { id: 'general-search', label: 'Search', group: 'General', keys: ['/'], scope: 'global' },
  {
    id: 'general-customize',
    label: 'Customize Home',
    group: 'General',
    keys: ['c'],
    scope: 'global',
  },
  {
    id: 'general-cheat',
    label: 'This cheat sheet',
    group: 'General',
    keys: ['?'],
    scope: 'global',
  },
];

export const SHORTCUT_GROUPS: Array<{ title: ShortcutGroupName; rows: ShortcutDefinition[] }> = (
  ['Go', 'Create', 'Focus', 'Plan calendar', 'General'] as ShortcutGroupName[]
).map((title) => ({
  title,
  rows: SHORTCUT_DEFINITIONS.filter((definition) => definition.group === title),
}));

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

function dispatch(name: string): void {
  window.dispatchEvent(new CustomEvent(name));
}

function uiBlocksShortcuts(): boolean {
  return Boolean(
    document.querySelector('.modal-backdrop, .modal.open, .pal, .pr-overlay, .fm'),
  );
}

export interface ShortcutOptions {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  openCheatSheet: () => void;
}

export interface ShortcutController {
  chordHint: string | null;
}

/**
 * Central keyboard registry. Single keys run on bubble (so Plan keeps its
 * calendar keys); chord second keys run on capture so they win over view keys.
 */
export function useShortcuts({
  route,
  navigate,
  openCheatSheet,
}: ShortcutOptions): ShortcutController {
  const [chordHint, setChordHint] = useState<string | null>(null);
  const chordRef = useRef<ChordPrefix | null>(null);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);

  const openNewTask = useCallback(() => {
    navigate('tasks');
    focusWhenReady('#todo-title');
  }, [navigate]);

  const openNewBlock = useCallback(() => {
    navigate('plan');
    window.setTimeout(() => dispatch('personalos:new-block'), 80);
  }, [navigate]);

  const openNewNote = useCallback(() => {
    navigate('notes');
    window.setTimeout(() => dispatch('personalos:new-note'), 80);
  }, [navigate]);

  const customizeHome = useCallback(() => {
    navigate('home');
    window.setTimeout(() => dispatch('personalos:customize-home'), 90);
  }, [navigate]);

  const focusSearch = useCallback(() => {
    navigate('home');
    focusWhenReady('#home-search');
  }, [navigate]);

  const closeChord = useCallback((fire = false) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    chordRef.current = null;
    setChordHint(null);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (fire && pending) pending();
  }, []);

  const startChord = useCallback(
    (prefix: ChordPrefix) => {
      chordRef.current = prefix;
      setChordHint(`${prefix}…`);
      // Bare n in Plan used to open the block form instantly. It now waits for
      // the chord window, then falls back to the same action.
      pendingRef.current =
        prefix === 'n' && route === 'plan' ? () => openNewBlock() : null;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => closeChord(true), CHORD_TIMEOUT_MS);
    },
    [route, openNewBlock, closeChord],
  );

  const runCreate = useCallback(
    (kind: 'task' | 'block' | 'note') => {
      if (kind === 'task') openNewTask();
      else if (kind === 'block') openNewBlock();
      else openNewNote();
    },
    [openNewTask, openNewBlock, openNewNote],
  );

  // Pending chords cancel on any pointer interaction.
  useEffect(() => {
    const onPointerDown = () => {
      if (chordRef.current) closeChord(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [closeChord]);

  // Chord second keys resolve on capture, before Plan's same-letter handlers.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const prefix = chordRef.current;
      if (!prefix) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || uiBlocksShortcuts()) return;
      if (event.shiftKey && event.key.toLowerCase() === 'n') {
        closeChord(false);
        return;
      }
      const resolution = resolveChord(prefix, event.key);
      if (resolution.kind === 'miss') {
        closeChord(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (resolution.kind === 'restart') {
        closeChord(false);
        startChord(resolution.chord);
        return;
      }
      closeChord(false);
      if (resolution.kind === 'route') navigate(resolution.route);
      else runCreate(resolution.create);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [closeChord, startChord, navigate, runCreate]);

  // Single keys and chord starts run on bubble.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (isPaletteOpen()) return;
        event.preventDefault();
        openPalette();
        return;
      }
      if (isTypingTarget(event.target) || uiBlocksShortcuts()) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.defaultPrevented) {
        if (chordRef.current) closeChord(false);
        return;
      }

      const key = event.key;
      const lower = key.toLowerCase();

      if (key in KEY_ROUTE_MAP) {
        event.preventDefault();
        const target = KEY_ROUTE_MAP[key];
        if (target) navigate(target);
        return;
      }
      if (key === '?') {
        event.preventDefault();
        openCheatSheet();
        return;
      }
      if (key === '/') {
        event.preventDefault();
        focusSearch();
        return;
      }
      if (lower === 'f') {
        event.preventDefault();
        noise.ensureContext();
        openFocusMode();
        return;
      }
      if (lower === 'c') {
        event.preventDefault();
        customizeHome();
        return;
      }
      if (event.shiftKey && lower === 'n') {
        event.preventDefault();
        closeChord(false);
        openNewBlock();
        return;
      }
      if (isChordPrefix(lower)) {
        event.preventDefault();
        startChord(lower);
        return;
      }
      if (key === ' ') {
        const active = document.activeElement;
        if (
          active &&
          active !== document.body &&
          active.closest?.('button, [role="button"], a[href], summary')
        ) {
          return;
        }
        event.preventDefault();
        pomodoro.toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    navigate,
    openCheatSheet,
    focusSearch,
    customizeHome,
    closeChord,
    startChord,
    openNewBlock,
  ]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return { chordHint };
}

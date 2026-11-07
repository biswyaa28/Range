import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { AppState } from '@/domain/types';
import { defaultState } from '@/domain/types';
import { addDays, todayISO } from '@/domain/dates';
import { store } from '@/store';
import { ToastProvider } from '@/ui/Toast';
import { HomeView } from '@/features/home/HomeView';
import { HomeProvider } from '@/features/home/HomeContext';
import { buildHomeData } from '@/features/home/homeData';
import { HOME_CARDS } from '@/features/home/cards/registry';

function seededState(): AppState {
  const state = defaultState();
  const T = todayISO();
  state.profile.name = 'Ada';
  state.profile.greeting = 'hey';
  state.profile.preset = 'balanced';
  state.tasks = [
    {
      id: 'task-alpha',
      title: 'Alpha assignment',
      due: T,
      priority: 'high',
      done: false,
      category: 'study',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      deleted: false,
      deviceId: 'dev',
    },
    {
      id: 'task-beta',
      title: 'Beta reading',
      due: addDays(T, 2),
      priority: 'low',
      done: true,
      category: 'study',
      createdAt: '2026-11-02T10:00:00Z',
      updatedAt: '2026-11-02T10:00:00Z',
      deleted: false,
      deviceId: 'dev',
    },
  ];
  state.notes = [
    {
      id: 'note-alpha',
      title: 'Alpha notes',
      body: 'Remember the alpha review.',
      pinned: false,
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      deleted: false,
      deviceId: 'dev',
    },
  ];
  state.blocks = [
    {
      id: 'block-alpha',
      title: 'Alpha lecture',
      day: new Date().getDay() === 0 ? 6 : new Date().getDay() - 1,
      start: '09:00',
      end: '10:00',
      category: 'class',
      done: false,
      doneDates: [],
      source: 'college',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      deleted: false,
      deviceId: 'dev',
    },
    {
      id: 'block-beta',
      title: 'Beta study',
      day: new Date().getDay() === 0 ? 6 : new Date().getDay() - 1,
      start: '18:00',
      end: '19:00',
      category: 'study',
      done: false,
      doneDates: [],
      source: 'personal',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      deleted: false,
      deviceId: 'dev',
    },
  ];
  state.deadlines = [
    {
      id: 'deadline-alpha',
      title: 'Alpha submission',
      course: 'CS101',
      due: addDays(T, 2),
      type: 'assignment',
      status: 'approved',
      source: 'college-sync',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      deleted: false,
      deviceId: 'dev',
    },
  ];
  return state;
}

function renderHome(onNavigate = vi.fn()) {
  const result = render(
    <ToastProvider>
      <HomeView onNavigate={onNavigate} />
    </ToastProvider>,
  );
  return { ...result, onNavigate };
}

function cardIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.card[data-card]')).map(
    (element) => element.dataset.card ?? '',
  );
}

describe('home card registry', () => {
  it('exposes the legacy card contracts', () => {
    expect(HOME_CARDS.map((card) => card.id)).toEqual([
      'progress',
      'weekly',
      'focus',
      'tasks',
      'upnext',
      'deadlines',
      'streak',
      'quick',
      'health',
      'calendar',
      'timeline',
    ]);

    HOME_CARDS.forEach((card) => {
      expect(card.allowedSizes.length).toBeGreaterThan(0);
      expect(card.allowedSizes).toContain(card.defaultSize);
      expect(new Set(card.allowedSizes).size).toBe(card.allowedSizes.length);
    });
  });

  it.each(HOME_CARDS.flatMap((card) => card.allowedSizes.map((size) => [card, size] as const)))(
    'renders $0.id at $1',
    (card, size) => {
      const state = seededState();
      const data = buildHomeData(state, new Date('2026-11-07T10:00:00'));
      const { container } = render(
        <HomeProvider
          value={{
            data,
            actions: {
              navigate: vi.fn(),
              openDeadlines: vi.fn(),
              addTask: vi.fn(),
              startFocus: vi.fn(),
            },
          }}
        >
          {card.render(size)}
        </HomeProvider>,
      );

      expect(container.textContent?.trim().length).toBeGreaterThan(0);
      expect(container.querySelector('h3, h4')).not.toBeNull();
    },
  );
});

describe('HomeView customization and actions', () => {
  beforeEach(() => {
    store.importAll(seededState());
    document.body.className = '';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the greeting, live copy and balanced default layout', () => {
    renderHome();
    expect(screen.getByText('Hey, Ada')).toBeDefined();
    expect(screen.getByText(/task left/i)).toBeDefined();

    const ids = cardIds();
    expect(ids).toContain('progress');
    expect(ids).toContain('weekly');
    expect(ids).not.toContain('streak');
  });

  it('hides a card, restores it from the tray, and supports toast undo', () => {
    renderHome();
    fireEvent.click(screen.getByLabelText('Customize Home cards'));

    fireEvent.click(screen.getByLabelText('Hide Weekly activity from Home'));
    expect(cardIds()).not.toContain('weekly');
    expect(store.get().layout.hidden).toContain('weekly');

    const trayChip = document.querySelector<HTMLButtonElement>(
      '#hidden-tray [data-role="show"][data-card="weekly"]',
    );
    expect(trayChip).not.toBeNull();
    fireEvent.click(trayChip as HTMLButtonElement);
    expect(cardIds()).toContain('weekly');
    expect(store.get().layout.hidden).not.toContain('weekly');

    fireEvent.click(screen.getByLabelText('Hide Weekly activity from Home'));
    const undoButtons = screen.getAllByRole('button', { name: 'Undo' });
    fireEvent.click(undoButtons[undoButtons.length - 1] as HTMLButtonElement);
    expect(cardIds()).toContain('weekly');
    expect(store.get().layout.hidden).not.toContain('weekly');
  });

  it('applies presets and persists the selected preset name', () => {
    renderHome();
    fireEvent.click(screen.getByLabelText('Customize Home cards'));

    const select = screen.getByLabelText('Layout preset') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'minimal' } });

    expect(store.get().profile.preset).toBe('minimal');
    expect(cardIds()).toEqual(['progress', 'tasks', 'upnext', 'focus']);

    fireEvent.change(select, { target: { value: 'everything' } });
    expect(cardIds()).toEqual(HOME_CARDS.map((card) => card.id));
  });

  it('moves and resizes cards through keyboard and size controls', () => {
    renderHome();
    fireEvent.click(screen.getByLabelText('Customize Home cards'));

    const before = cardIds().indexOf('progress');
    fireEvent.click(screen.getByLabelText('Move Today’s progress later'));
    expect(cardIds().indexOf('progress')).toBe(before + 1);

    fireEvent.click(screen.getByLabelText('Set Today’s tasks to large'));
    expect(store.get().layout.size.tasks).toBe('L');
    expect(
      document.querySelector<HTMLElement>('[data-card="tasks"]')?.dataset.size,
    ).toBe('L');
  });

  it('routes greeting quick actions and focuses their targets', () => {
    const focusTarget = document.createElement('div');
    focusTarget.id = 'focus-start';
    focusTarget.tabIndex = -1;
    document.body.appendChild(focusTarget);
    const taskTarget = document.createElement('input');
    taskTarget.id = 'todo-title';
    document.body.appendChild(taskTarget);

    const { onNavigate } = renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    expect(onNavigate).toHaveBeenCalledWith('focus');

    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onNavigate).toHaveBeenCalledWith('tasks');

    focusTarget.remove();
    taskTarget.remove();
  });

  it('searches live across scopes and opens a result', () => {
    const { onNavigate } = renderHome();
    const search = screen.getByLabelText('Search') as HTMLInputElement;
    const results = () => document.getElementById('sres') as HTMLElement;

    fireEvent.change(search, { target: { value: 'Alpha' } });
    expect(within(results()).getByText('Alpha assignment')).toBeDefined();
    expect(within(results()).getByText('Alpha notes')).toBeDefined();
    expect(within(results()).getByText('Alpha lecture · 09:00')).toBeDefined();
    expect(within(results()).getByText('Alpha submission')).toBeDefined();

    fireEvent.click(within(results()).getByText('Alpha notes'));
    expect(onNavigate).toHaveBeenCalledWith('notes');

    fireEvent.click(screen.getByRole('button', { name: /Tasks/i }));
    expect(within(results()).getByText('Alpha assignment')).toBeDefined();
    expect(within(results()).queryByText('Alpha notes')).toBeNull();
    expect(within(results()).queryByText('Alpha lecture · 09:00')).toBeNull();

    fireEvent.change(search, { target: { value: 'zzz-nothing' } });
    expect(within(results()).getByText('No matches.')).toBeDefined();
  });

  it('rejects unknown stored layout ids and fills missing cards', () => {
    store.set((state) => {
      state.layout.order = ['ghost', 'tasks', 'progress'];
      state.layout.size = { tasks: 'XL', progress: 'XL', ghost: 'L' };
      state.layout.hidden = ['ghost', 'weekly', 'weekly'];
    });
    renderHome();

    const ids = cardIds();
    expect(ids.indexOf('ghost')).toBe(-1);
    expect(ids.indexOf('tasks')).toBe(0);
    expect(ids).not.toContain('weekly');
    expect(
      document.querySelector<HTMLElement>('[data-card="tasks"]')?.dataset.size,
    ).toBe('XL');
    expect(
      document.querySelector<HTMLElement>('[data-card="progress"]')?.dataset.size,
    ).toBe('M');
  });

  it('shows every empty state with an action button', () => {
    store.importAll(defaultState());
    renderHome();

    const emptyStates = document.querySelectorAll('.es');
    expect(emptyStates.length).toBeGreaterThan(0);
    emptyStates.forEach((empty) => {
      expect(empty.querySelector('svg')).not.toBeNull();
      expect(empty.querySelector('button')).not.toBeNull();
      expect(empty.querySelector('p')?.textContent?.trim().length).toBeGreaterThan(0);
    });
  });
});

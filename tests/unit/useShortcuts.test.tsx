import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useShortcuts } from '@/hooks/useShortcuts';
import type { AppRoute } from '@/hooks';
import { pomodoro } from '@/engines';
import { closeFocusMode, isFocusModeOpen } from '@/features/focus/focusModeBus';
import { closePalette, isPaletteOpen } from '@/features/palette/paletteBus';

function Harness({
  route,
  navigate,
  openCheatSheet,
  blocked = false,
}: {
  route: AppRoute;
  navigate: (route: AppRoute) => void;
  openCheatSheet: () => void;
  blocked?: boolean;
}) {
  const { chordHint } = useShortcuts({ route, navigate, openCheatSheet });
  return (
    <>
      <input id="todo-title" aria-label="Task title" />
      <input id="home-search" aria-label="Search" />
      <button type="button">Button</button>
      {blocked && <div className="pal" />}
      <span data-testid="hint">{chordHint ?? ''}</span>
    </>
  );
}

function setup(options: { route?: AppRoute; blocked?: boolean } = {}) {
  const navigate = vi.fn();
  const openCheatSheet = vi.fn();
  const view = render(
    <Harness
      route={options.route ?? 'tasks'}
      navigate={navigate}
      openCheatSheet={openCheatSheet}
      blocked={options.blocked}
    />,
  );
  return { ...view, navigate, openCheatSheet };
}

describe('useShortcuts', () => {
  beforeEach(() => {
    closePalette();
    closeFocusMode();
    pomodoro.reset();
  });

  afterEach(() => {
    act(() => {
      closePalette();
      closeFocusMode();
      pomodoro.reset();
    });
    vi.useRealTimers();
  });

  it('ignores chords and single keys while typing', () => {
    const { navigate } = setup();
    const input = screen.getByLabelText('Task title');
    input.focus();

    fireEvent.keyDown(input, { key: 'g' });
    fireEvent.keyDown(input, { key: 'h' });
    fireEvent.keyDown(input, { key: 'f' });
    fireEvent.keyDown(input, { key: '?' });

    expect(navigate).not.toHaveBeenCalled();
    expect(isFocusModeOpen()).toBe(false);
    expect(screen.getByTestId('hint').textContent).toBe('');
  });

  it('resolves g chords, shows the hint and navigates', () => {
    const { navigate } = setup();

    fireEvent.keyDown(window, { key: 'g' });
    expect(screen.getByTestId('hint').textContent).toBe('g…');

    fireEvent.keyDown(window, { key: 'h' });
    expect(navigate).toHaveBeenCalledWith('home');
    expect(screen.getByTestId('hint').textContent).toBe('');
  });

  it('resolves n chords and focuses the create target', () => {
    const { navigate } = setup();

    fireEvent.keyDown(window, { key: 'n' });
    fireEvent.keyDown(window, { key: 't' });

    expect(navigate).toHaveBeenCalledWith('tasks');
    expect(document.activeElement).toBe(screen.getByLabelText('Task title'));
  });

  it('falls back to a new block when a bare n chord expires in Plan', () => {
    vi.useFakeTimers();
    const { navigate } = setup({ route: 'plan' });
    const onNewBlock = vi.fn();
    window.addEventListener('personalos:new-block', onNewBlock);

    fireEvent.keyDown(window, { key: 'n' });
    expect(screen.getByTestId('hint').textContent).toBe('n…');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(navigate).toHaveBeenCalledWith('plan');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onNewBlock).toHaveBeenCalled();
    expect(screen.getByTestId('hint').textContent).toBe('');
    window.removeEventListener('personalos:new-block', onNewBlock);
  });

  it('opens the palette with Ctrl/Cmd K even while a modal is open', () => {
    setup({ blocked: true });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(isPaletteOpen()).toBe(true);
  });

  it('ignores view keys while a modal or palette is present', () => {
    setup({ blocked: true });

    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyDown(window, { key: '?' });
    fireEvent.keyDown(window, { key: '1' });

    expect(isFocusModeOpen()).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('supports Shift+N, search, customize, help and numeric routes', () => {
    const { navigate, openCheatSheet } = setup({ route: 'home' });

    fireEvent.keyDown(window, { key: 'N', shiftKey: true });
    expect(navigate).toHaveBeenCalledWith('plan');

    fireEvent.keyDown(window, { key: '/' });
    expect(navigate).toHaveBeenCalledWith('home');
    expect(document.activeElement).toBe(screen.getByLabelText('Search'));

    fireEvent.keyDown(window, { key: 'c' });
    expect(navigate).toHaveBeenCalledWith('home');

    fireEvent.keyDown(window, { key: '?' });
    expect(openCheatSheet).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: '1' });
    expect(navigate).toHaveBeenCalledWith('home');
    fireEvent.keyDown(window, { key: '6' });
    expect(navigate).toHaveBeenCalledWith('focus');
  });

  it('toggles the timer with Space unless a button is focused', () => {
    setup();
    const button = screen.getByRole('button', { name: 'Button' });
    button.focus();

    fireEvent.keyDown(button, { key: ' ' });
    expect(pomodoro.getSnapshot().running).toBe(false);

    button.blur();
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(pomodoro.getSnapshot().running).toBe(true);
  });
});

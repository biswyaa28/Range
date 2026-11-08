import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { defaultState } from '@/domain/types';
import { store } from '@/store';
import { ToastProvider } from '@/ui/Toast';
import { FocusView } from '@/features/focus/FocusView';

function renderFocus() {
  return render(
    <ToastProvider>
      <FocusView />
    </ToastProvider>,
  );
}

function openPrompter() {
  renderFocus();
  fireEvent.click(screen.getByRole('radio', { name: 'Prompter' }));
  fireEvent.change(screen.getByLabelText('Prompter script'), {
    target: { value: 'Opening line.\n\nSecond beat.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Open reading mode/ }));
  return screen.getByRole('dialog', { name: 'Prompter reading mode' });
}

describe('Prompter reading mode', () => {
  beforeEach(() => {
    store.importAll(defaultState());
  });

  it('shows the script and counts words in the editor', () => {
    renderFocus();
    fireEvent.click(screen.getByRole('radio', { name: 'Prompter' }));

    expect(
      screen.getByRole('radio', { name: 'Prompter' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.change(screen.getByLabelText('Prompter script'), {
      target: { value: 'one two three' },
    });
    expect(screen.getByText('3 words')).toBeDefined();
    expect(store.get().settings.prompter.text).toBe('one two three');
  });

  it('opens the overlay with playback, size, speed, mirror and exit controls', () => {
    openPrompter();
    expect(document.querySelector('.pr-text')?.textContent).toContain('Opening line.');

    fireEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(document.querySelector<HTMLElement>('.pr-text')?.style.fontSize).toBe('56px');
    expect(store.get().settings.prompter.size).toBe(56);

    fireEvent.click(screen.getByRole('button', { name: 'Faster' }));
    expect(screen.getByText('Speed 4')).toBeDefined();
    expect(store.get().settings.prompter.speed).toBe(4);

    fireEvent.click(screen.getByRole('button', { name: 'Mirror flip' }));
    expect(document.querySelector('.pr-stage')?.classList.contains('mirror')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Play scrolling' }));
    expect(screen.getByRole('button', { name: 'Pause scrolling' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Exit reading mode' }));
    expect(screen.queryByRole('dialog', { name: 'Prompter reading mode' })).toBeNull();
  });

  it('handles Space, +/-, arrows, M and Esc from the keyboard', () => {
    openPrompter();

    fireEvent.keyDown(document.body, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Pause scrolling' })).toBeDefined();

    fireEvent.keyDown(document.body, { key: '+' });
    expect(document.querySelector<HTMLElement>('.pr-text')?.style.fontSize).toBe('56px');

    fireEvent.keyDown(document.body, { key: '-' });
    expect(document.querySelector<HTMLElement>('.pr-text')?.style.fontSize).toBe('48px');

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByText('Speed 4')).toBeDefined();

    fireEvent.keyDown(document.body, { key: 'm' });
    expect(document.querySelector('.pr-stage')?.classList.contains('mirror')).toBe(true);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Prompter reading mode' })).toBeNull();
  });

  it('loads and clears the sample script', () => {
    renderFocus();
    fireEvent.click(screen.getByRole('radio', { name: 'Prompter' }));

    fireEvent.click(screen.getByRole('button', { name: 'Sample text' }));
    expect((screen.getByLabelText('Prompter script') as HTMLTextAreaElement).value).not.toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect((screen.getByLabelText('Prompter script') as HTMLTextAreaElement).value).toBe('');
  });
});

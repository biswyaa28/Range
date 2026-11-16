import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NotesView, createNote } from '@/features/notes/NotesView';
import { ToastProvider } from '@/ui/Toast';
import { store } from '@/store';
import { defaultState } from '@/domain/types';

function renderNotesView() {
  return render(
    <ToastProvider>
      <NotesView />
    </ToastProvider>,
  );
}

describe('NotesView', () => {
  beforeEach(() => {
    vi.useRealTimers();
    const clean = defaultState();
    clean.notes = [
      {
        id: 'n-1',
        title: 'Alpha Note',
        body: 'First body line\nSecond line',
        pinned: false,
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
        deleted: false,
        deviceId: 'dev1',
      },
      {
        id: 'n-2',
        title: 'Beta Note',
        body: 'Second body line',
        pinned: true,
        createdAt: '2026-11-02T10:00:00Z',
        updatedAt: '2026-11-02T10:00:00Z',
        deleted: false,
        deviceId: 'dev1',
      },
      {
        id: 'n-3',
        title: 'Gamma Note',
        body: 'Third body special keyword',
        pinned: false,
        createdAt: '2026-11-03T10:00:00Z',
        updatedAt: '2026-11-03T10:00:00Z',
        deleted: false,
        deviceId: 'dev1',
      },
      {
        id: 'n-4',
        title: 'Deleted Note',
        body: 'Should not show',
        pinned: false,
        createdAt: '2026-11-04T10:00:00Z',
        updatedAt: '2026-11-04T10:00:00Z',
        deleted: true,
        deviceId: 'dev1',
      },
    ];
    store.importAll(clean);
  });

  it('orders pinned notes first', () => {
    renderNotesView();
    // First note should be the pinned one ('Beta Note')
    const titles = screen.getAllByText(/(Alpha Note|Beta Note|Gamma Note)/);
    expect(titles[0]?.textContent).toBe('Beta Note');
  });

  it('filters notes live matching title or body', () => {
    renderNotesView();
    expect(screen.getByText('Alpha Note')).toBeDefined();
    expect(screen.getByText('Beta Note')).toBeDefined();
    expect(screen.getByText('Gamma Note')).toBeDefined();

    const searchInput = screen.getByPlaceholderText('Search notes…');
    fireEvent.change(searchInput, { target: { value: 'special keyword' } });

    expect(screen.queryByText('Alpha Note')).toBeNull();
    expect(screen.queryByText('Beta Note')).toBeNull();
    expect(screen.getByText('Gamma Note')).toBeDefined();

    fireEvent.change(searchInput, { target: { value: 'nomatchanything' } });
    expect(screen.getByText('No notes match “nomatchanything”.')).toBeDefined();

    // Clear search button resets query
    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(screen.getByText('Alpha Note')).toBeDefined();
  });

  it('debounced autosave bumps updatedAt and persists content', async () => {
    vi.useFakeTimers();
    renderNotesView();

    const alphaItem = screen.getByText('Alpha Note');
    fireEvent.click(alphaItem);

    const titleInput = screen.getByLabelText('Note title') as HTMLInputElement;
    const bodyInput = screen.getByLabelText('Note body') as HTMLTextAreaElement;

    const oldUpdatedAt = store.get().notes.find((n) => n.id === 'n-1')?.updatedAt;

    fireEvent.change(titleInput, { target: { value: 'Alpha Updated' } });
    fireEvent.change(bodyInput, { target: { value: 'New body content' } });

    // Advance fake timers by 400ms to trigger debounced autosave
    act(() => {
      vi.advanceTimersByTime(400);
    });

    const noteInStore = store.get().notes.find((n) => n.id === 'n-1');
    expect(noteInStore?.title).toBe('Alpha Updated');
    expect(noteInStore?.body).toBe('New body content');
    expect(noteInStore?.updatedAt).not.toBe(oldUpdatedAt);

    vi.useRealTimers();
  });

  it('pins and unpins a note correctly updating order', () => {
    renderNotesView();

    // Select Alpha Note
    fireEvent.click(screen.getByText('Alpha Note'));
    const pinBtn = screen.getByLabelText('Pin note');
    fireEvent.click(pinBtn);

    const noteInStore = store.get().notes.find((n) => n.id === 'n-1');
    expect(noteInStore?.pinned).toBe(true);
  });

  it('soft deletes note and restores via Undo toast', () => {
    renderNotesView();

    // Select Alpha Note
    fireEvent.click(screen.getByText('Alpha Note'));
    const delBtn = screen.getByLabelText('Delete note');
    fireEvent.click(delBtn);

    expect(store.get().notes.find((n) => n.id === 'n-1')?.deleted).toBe(true);

    // Undo toast
    const undoBtn = screen.getByText('Undo');
    expect(undoBtn).toBeDefined();
    fireEvent.click(undoBtn);

    expect(store.get().notes.find((n) => n.id === 'n-1')?.deleted).toBe(false);
  });

  it('exposes createNote helper', () => {
    const createdId = createNote();
    expect(typeof createdId).toBe('string');
    const n = store.get().notes.find((x) => x.id === createdId);
    expect(n).toBeDefined();
    expect(n?.title).toBe('');
    expect(n?.pinned).toBe(false);
  });

  it('deletes a note from the keyboard', () => {
    renderNotesView();

    const alphaRow = screen.getByText('Alpha Note').closest('button');
    expect(alphaRow).not.toBeNull();

    fireEvent.keyDown(alphaRow as HTMLButtonElement, { key: 'Delete' });
    expect(store.get().notes.find((n) => n.id === 'n-1')?.deleted).toBe(true);
  });

  it('clears the search field with the Escape key', () => {
    renderNotesView();

    const searchInput = screen.getByPlaceholderText('Search notes…') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'nomatchanything' } });
    expect(screen.getByText('No notes match “nomatchanything”.')).toBeDefined();

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput.value).toBe('');
    expect(screen.getByText('Alpha Note')).toBeDefined();
  });
});

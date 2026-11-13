import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Note } from '@/domain/types';
import { fmtStamp } from '@/domain/dates';
import { NOTE_BODY_MAX_CHARS } from '@/domain/limits';
import { useStore, store } from '@/store';
import { stampNewRecord, softDeleteRecord, softUndeleteRecord, touchRecord } from '@/store/stamp';
import { Icon } from '@/ui/Icon';
import { useToast } from '@/ui/Toast';
import { Haptics } from '@/engines/haptics';
import { useSwipe } from '@/hooks/useSwipe';
import './NotesView.css';

interface NoteRowProps {
  note: Note;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const NoteRow: React.FC<NoteRowProps> = ({ note, active, onSelect, onDelete }) => {
  const { ref: swipeRef, transform, swiping, offset, handlers } = useSwipe<HTMLButtonElement>({
    onCommitLeft: () => {
      onDelete(note.id);
    },
  });

  const swipeLeft = offset < 0;
  const swipeOpacity = Math.min(1, Math.abs(offset) / 64).toFixed(2);
  const firstLine = String(note.body || '').split('\n')[0] || 'Empty note';

  return (
    <div className="notes-item-wrap">
      <button
        ref={swipeRef}
        type="button"
        className={`note-item${active ? ' active' : ''}${swiping ? ' swiping' : ''}`}
        data-action="note-select"
        data-id={note.id}
        style={{ transform }}
        onClick={() => onSelect(note.id)}
        aria-selected={active}
        {...handlers}
      >
        <span
          className={`swipe-rv ${swipeLeft ? 'left' : ''}`}
          style={{ opacity: swiping && swipeLeft ? swipeOpacity : 0 }}
          aria-hidden="true"
        >
          <span className="sv-l">
            <Icon name="trash" />
          </span>
        </span>
        <span className="ni-top">
          <span className="ni-title">{note.title || 'Untitled'}</span>
          {note.pinned && <span className="chip solid">Pinned</span>}
          <span className="ni-date">{fmtStamp(note.updatedAt)}</span>
        </span>
        <span className="ni-snip">{firstLine}</span>
      </button>
    </div>
  );
};

export const createNote = (): string => {
  let createdId = '';
  store.set((state) => {
    const newNote = stampNewRecord<Partial<Note>>(
      {
        title: '',
        body: '',
        pinned: false,
      },
      state.deviceId,
      () => crypto.randomUUID(),
    ) as Note;
    state.notes.unshift(newNote);
    createdId = newNote.id;
  });
  return createdId;
};

export const NotesView: React.FC = () => {
  const toast = useToast();
  const notes = useStore((s) => s.notes);

  const [notesSel, setNotesSel] = useState<string | null>(null);
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesQuery, setNotesQuery] = useState('');

  // Draft text in editor for currently active note
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [savedBadgeShow, setSavedBadgeShow] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedBadgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Selected note
  const liveNotes = useMemo(() => notes.filter((n) => !n.deleted), [notes]);
  const sel = useMemo(() => liveNotes.find((n) => n.id === notesSel) || null, [liveNotes, notesSel]);

  // Sync draft when selected note changes
  useEffect(() => {
    if (sel) {
      setDraftTitle(sel.title || '');
      setDraftBody(sel.body || '');
    } else {
      setDraftTitle('');
      setDraftBody('');
    }
  }, [sel]);

  // Scrollline progress handler
  useEffect(() => {
    const onScroll = () => {
      const scrollLine = document.getElementById('scrollline');
      if (!scrollLine) return;

      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 40) {
        scrollLine.classList.add('on');
        const pct = Math.min(1, Math.max(0.004, window.scrollY / max));
        scrollLine.style.transform = `scaleX(${pct.toFixed(4)})`;
      } else {
        scrollLine.classList.remove('on');
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      const scrollLine = document.getElementById('scrollline');
      if (scrollLine) {
        scrollLine.classList.remove('on');
        scrollLine.style.transform = 'scaleX(0)';
      }
    };
  }, []);

  // Flush unsaved draft to store immediately
  const flushDraft = useCallback(() => {
    if (!notesSel) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    store.set((state) => {
      const n = state.notes.find((x) => x.id === notesSel && !x.deleted);
      if (n && (n.title !== draftTitle || n.body !== draftBody)) {
        n.title = draftTitle;
        n.body = draftBody;
        touchRecord(n);
      }
    });
  }, [notesSel, draftTitle, draftBody]);

  // Autosave when draftTitle or draftBody changes
  const triggerAutosave = (newTitle: string, newBody: string) => {
    if (!notesSel) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      store.set((state) => {
        const n = state.notes.find((x) => x.id === notesSel && !x.deleted);
        if (n) {
          n.title = newTitle;
          n.body = newBody;
          touchRecord(n);
        }
      });
      setSavedBadgeShow(true);
      if (savedBadgeTimeoutRef.current) {
        clearTimeout(savedBadgeTimeoutRef.current);
      }
      savedBadgeTimeoutRef.current = setTimeout(() => {
        setSavedBadgeShow(false);
      }, 1100);
    }, 350);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDraftTitle(val);
    triggerAutosave(val, draftBody);
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value.slice(0, NOTE_BODY_MAX_CHARS);
    setDraftBody(val);
    triggerAutosave(draftTitle, val);
  };

  const handleSelectNote = (id: string) => {
    flushDraft();
    setNotesSel(id);
    setNotesEditing(true);
  };

  const handleNewNote = () => {
    flushDraft();
    const newId = createNote();
    setNotesSel(newId);
    setNotesEditing(true);
    Haptics.tap();
    setTimeout(() => {
      if (titleInputRef.current) {
        titleInputRef.current.focus();
      }
    }, 50);
  };

  // Palette results / create chord land here after navigation.
  useEffect(() => {
    const openNote = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id) return;
      setNotesSel(id);
      setNotesEditing(true);
    };
    const newNote = () => {
      const newId = createNote();
      setNotesSel(newId);
      setNotesEditing(true);
      setTimeout(() => titleInputRef.current?.focus(), 50);
    };
    window.addEventListener('personalos:open-note', openNote);
    window.addEventListener('personalos:new-note', newNote);
    return () => {
      window.removeEventListener('personalos:open-note', openNote);
      window.removeEventListener('personalos:new-note', newNote);
    };
  }, []);

  const handleTogglePin = (id: string) => {
    flushDraft();
    store.set((state) => {
      const n = state.notes.find((x) => x.id === id);
      if (n) {
        n.pinned = !n.pinned;
        touchRecord(n);
      }
    });
    Haptics.tap();
  };

  const handleTogglePrivate = (id: string) => {
    flushDraft();
    store.set((state) => {
      const note = state.notes.find((entry) => entry.id === id);
      if (note) {
        note.private = !note.private;
        touchRecord(note);
      }
    });
    Haptics.tap();
  };

  const handleDeleteNote = (id: string) => {
    flushDraft();
    let deletedNote: Note | null = null;
    store.set((state) => {
      deletedNote = softDeleteRecord(state.notes, id);
    });

    if (notesSel === id) {
      setNotesSel(null);
      setNotesEditing(false);
    }

    Haptics.warning();
    toast.showToast('Note deleted', 'Undo', () => {
      if (!deletedNote) return;
      store.set((state) => {
        const n = state.notes.find((x) => x.id === id);
        if (n) {
          softUndeleteRecord(n);
        }
      });
      setNotesSel(id);
      setNotesEditing(true);
      Haptics.select();
    });
  };

  // Filter & sort notes
  const sortedNotes = useMemo(() => {
    const q = notesQuery.trim().toLowerCase();
    return liveNotes
      .filter((n) => !q || (n.title + ' ' + (n.body || '')).toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }, [liveNotes, notesQuery]);

  return (
    <div className="view-content notes-view">
      <div className="view-head">
        <h1>Notes</h1>
        <div className="rule" />
      </div>

      <div className={`notes-grid${notesEditing && sel ? ' editing' : ''}`}>
        {/* Left pane: Notes list */}
        <div className="panel notes-list">
          <div className="nl-search">
            <div className="field">
              <label htmlFor="notes-search" className="sr-only">
                Search notes
              </label>
              <input
                id="notes-search"
                placeholder="Search notes…"
                value={notesQuery}
                onChange={(e) => setNotesQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn yellow"
              data-action="note-new"
              onClick={handleNewNote}
            >
              <Icon name="plus" /> NEW
            </button>
          </div>

          <div id="notes-list-inner">
            {sortedNotes.length > 0 ? (
              sortedNotes.map((n) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  active={n.id === notesSel}
                  onSelect={handleSelectNote}
                  onDelete={handleDeleteNote}
                />
              ))
            ) : (
              <div className="empty" style={{ padding: '18px' }}>
                <p className="hint">
                  {notesQuery ? `No notes match “${notesQuery}”.` : 'No notes yet.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right pane: Editor or empty state */}
        {sel ? (
          <div className="panel notes-editor">
            <div className="notes-toolbar">
              <button
                type="button"
                className="ibtn mobile-only"
                data-action="notes-back"
                aria-label="Back to list"
                onClick={() => {
                  flushDraft();
                  setNotesEditing(false);
                }}
              >
                <Icon name="x" />
              </button>
              <input
                id="note-title"
                ref={titleInputRef}
                value={draftTitle}
                placeholder="Title"
                maxLength={90}
                aria-label="Note title"
                onChange={handleTitleChange}
                onBlur={flushDraft}
              />
              <button
                type="button"
                className={`ibtn${sel.pinned ? ' on' : ''}`}
                data-action="note-pin"
                data-id={sel.id}
                aria-pressed={!!sel.pinned}
                aria-label="Pin note"
                onClick={() => handleTogglePin(sel.id)}
              >
                <Icon name="pin" />
              </button>
              <button
                type="button"
                className={`ibtn${sel.private ? ' on' : ''}`}
                data-action="note-private"
                aria-pressed={!!sel.private}
                aria-label={sel.private ? 'Make note visible to AI' : 'Make note private'}
                onClick={() => handleTogglePrivate(sel.id)}
              >
                <Icon name={sel.private ? 'eyeoff' : 'eye'} />
              </button>
              <button
                type="button"
                className="ibtn"
                data-action="note-del"
                data-id={sel.id}
                aria-label="Delete note"
                onClick={() => handleDeleteNote(sel.id)}
              >
                <Icon name="trash" />
              </button>
            </div>

            <textarea
              id="note-body"
              placeholder="Start writing…"
              aria-label="Note body"
              maxLength={NOTE_BODY_MAX_CHARS}
              value={draftBody}
              onChange={handleBodyChange}
              onBlur={flushDraft}
            />

            <div className="notes-foot">
              <span id="note-saved" className={savedBadgeShow ? 'show' : ''}>
                Saved
              </span>
              <span className={draftBody.length >= NOTE_BODY_MAX_CHARS ? 'notes-limit' : undefined}>
                {draftBody.length.toLocaleString()} / {NOTE_BODY_MAX_CHARS.toLocaleString()}
              </span>
              <span>Edited {fmtStamp(sel.updatedAt)}</span>
            </div>
          </div>
        ) : (
          <div className="panel notes-editor">
            <div className="empty" style={{ border: 'none' }}>
              <h3>No note selected</h3>
              <p className="hint">Pick a note from the list or create a new one.</p>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button
        type="button"
        className="fab"
        data-action="note-new"
        aria-label="New note"
        onClick={handleNewNote}
      >
        <Icon name="plus" />
      </button>
    </div>
  );
};

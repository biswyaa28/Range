import type { AppState } from './types';

/**
 * A note body beyond this length is truncated. Firestore's per-record limit is
 * 1 MiB; this keeps one note far below it while leaving room for the record's
 * metadata and the sync envelope.
 */
export const NOTE_BODY_MAX_CHARS = 200_000;

/**
 * A record whose JSON is larger than this is never pushed. It would fail the
 * whole batch and wedge every later record, so sync skips and reports it.
 */
export const RECORD_MAX_BYTES = 900_000;

export function clampNoteBody(body: string): string {
  return body.length > NOTE_BODY_MAX_CHARS ? body.slice(0, NOTE_BODY_MAX_CHARS) : body;
}

/** Truncates every note body in place and reports how many were changed. */
export function clampAppStateNotes(state: AppState): number {
  let clamped = 0;
  for (const note of state.notes) {
    if (typeof note.body === 'string' && note.body.length > NOTE_BODY_MAX_CHARS) {
      note.body = note.body.slice(0, NOTE_BODY_MAX_CHARS);
      clamped += 1;
    }
  }
  return clamped;
}

/** Counts notes in an imported backup whose body exceeds the cap. */
export function countOversizedNotes(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const notes = (value as Record<string, unknown>)['notes'];
  if (!Array.isArray(notes)) return 0;
  return notes.filter(
    (note) =>
      note &&
      typeof note === 'object' &&
      typeof (note as Record<string, unknown>)['body'] === 'string' &&
      ((note as Record<string, unknown>)['body'] as string).length > NOTE_BODY_MAX_CHARS,
  ).length;
}

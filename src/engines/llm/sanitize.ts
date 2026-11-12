/** Matches the data fence used to mark local content as untrusted. */
const DATA_FENCE = /<\s*\/?\s*untrusted-local-data\s*>/gi;

/**
 * Removes data-fence delimiters from untrusted text. Without this a note, task
 * title or imported timetable line containing `</untrusted-local-data>` could
 * close the fence and pose as instructions for the model.
 */
export function stripDataFence(text: string): string {
  return text.replace(DATA_FENCE, '');
}

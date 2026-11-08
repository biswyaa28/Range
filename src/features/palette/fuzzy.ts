/**
 * Port of the legacy palette scorer: subsequence matching where consecutive
 * runs and word-boundary matches earn more, with a tiny title-length penalty.
 * Returns -1 when the query is not a subsequence.
 */
export function fuzzyScore(query: string, title: string): number {
  const q = String(query || '').toLowerCase();
  const t = String(title || '').toLowerCase();
  if (!q) return 0;
  let qi = 0;
  let score = 0;
  let run = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t.charAt(i) === q.charAt(qi)) {
      qi++;
      run++;
      score +=
        1 +
        run +
        (i === 0 || /[\s/·.\-(]/.test(t.charAt(i - 1)) ? 3 : 0);
    } else {
      run = 0;
    }
  }
  return qi === q.length ? score - t.length * 0.01 : -1;
}

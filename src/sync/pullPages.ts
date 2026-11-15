/** One page of a record query, with the cursor the next page starts after. */
export interface PullPage<T> {
  records: T[];
  cursor: PullCursor | null;
  /** True when the page filled up; another page may follow. */
  hasMore: boolean;
}

/** Stable position in the `updatedAt, id` ordering. */
export interface PullCursor {
  updatedAt: string;
  id: string;
}

export interface PullPageProgress {
  /** Records read for this collection so far. */
  read: number;
  /** Cursor after the page, persisted so an interrupted pull resumes here. */
  cursor: PullCursor | null;
  page: number;
}

export interface DrainPagesOptions<T> {
  pageSize: number;
  cursor?: PullCursor | null;
  fetchPage: (cursor: PullCursor | null, limit: number) => Promise<PullPage<T>>;
  onPage?: (progress: PullPageProgress) => void;
  /** Guards against a remote that always returns a full page. */
  maxPages?: number;
}

/**
 * Reads a collection page by page. The caller persists each page cursor, so a
 * pull that fails halfway resumes at the failed page instead of rereading the
 * pages before it.
 */
export async function drainPages<T>({
  pageSize,
  cursor = null,
  fetchPage,
  onPage,
  maxPages = 10_000,
}: DrainPagesOptions<T>): Promise<T[]> {
  const out: T[] = [];
  let position = cursor;
  let page = 1;

  while (page <= maxPages) {
    const result = await fetchPage(position, pageSize);
    out.push(...result.records);
    onPage?.({ read: out.length, cursor: result.cursor, page });
    if (!result.hasMore || !result.cursor) break;
    position = result.cursor;
    page += 1;
  }

  return out;
}

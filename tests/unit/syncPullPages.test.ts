import { describe, expect, it } from 'vitest';
import { drainPages, type PullCursor } from '@/sync/pullPages';
import { SyncStateStore } from '@/store/syncState';

function fakeRemote(total: number) {
  const records = Array.from({ length: total }, (_, index) => ({
    id: `doc-${index}`,
    updatedAt: `2026-05-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
  }));
  let calls = 0;
  let failOnCall: number | null = null;

  async function fetchPage(cursor: PullCursor | null, limit: number) {
    calls += 1;
    if (failOnCall !== null && calls === failOnCall) throw new Error('network down');
    const start = cursor ? records.findIndex((record) => record.id === cursor.id) + 1 : 0;
    const page = records.slice(start, start + limit);
    const last = page[page.length - 1];
    return {
      records: page,
      cursor: last ? { updatedAt: last.updatedAt, id: last.id } : null,
      hasMore: page.length === limit,
    };
  }

  return {
    fetchPage,
    failAt: (call: number) => {
      failOnCall = call;
    },
    get calls() {
      return calls;
    },
  };
}

describe('paged pull', () => {
  it('reads 1,000 documents in four pages of 300', async () => {
    const remote = fakeRemote(1000);
    const pages: number[] = [];
    const rows = await drainPages({
      pageSize: 300,
      fetchPage: remote.fetchPage,
      onPage: (progress) => pages.push(progress.read),
    });

    expect(rows).toHaveLength(1000);
    expect(remote.calls).toBe(4);
    expect(pages).toEqual([300, 600, 900, 1000]);
  });

  it('resumes at page 3 after a failure and does not reread pages 1 and 2', async () => {
    const remote = fakeRemote(1000);
    const values = new Map<string, string>();
    const store = new SyncStateStore({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    });
    remote.failAt(3);

    let saved: PullCursor | null = null;
    await expect(
      drainPages({
        pageSize: 300,
        fetchPage: remote.fetchPage,
        onPage: (progress) => {
          if (progress.cursor) {
            saved = progress.cursor;
            store.writeCheckpoint({
              schema: 1,
              accountUid: 'user-1',
              collection: 'tasks',
              updatedAt: progress.cursor.updatedAt,
              id: progress.cursor.id,
            });
          }
        },
      }),
    ).rejects.toThrow('network down');

    expect(saved).not.toBeNull();
    expect(remote.calls).toBe(3);

    const checkpoint = store.readCheckpoint(1, 'user-1');
    expect(checkpoint?.id).toBe('doc-599');

    const rows = await drainPages({
      pageSize: 300,
      cursor: { updatedAt: checkpoint!.updatedAt, id: checkpoint!.id },
      fetchPage: remote.fetchPage,
    });

    expect(rows[0]?.id).toBe('doc-600');
    expect(rows).toHaveLength(400);
    expect(remote.calls).toBe(5);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fetchClassroomSnapshot, fetchGmailSnapshot } from '@/integrations/googleApi';
import { DEFAULT_INTEGRATION_SETTINGS } from '@/domain/integrations';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Classroom API client', () => {
  it('pages courses, coursework and announcements and maps them', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/courses?') && !url.includes('pageToken=')) {
        return json({
          courses: [{ id: 'c1', name: 'Algorithms', alternateLink: 'https://classroom/c1' }],
          nextPageToken: 'p2',
        });
      }
      if (url.includes('/courses?') && url.includes('pageToken=p2')) {
        return json({ courses: [{ id: 'c2', name: 'Physics' }] });
      }
      if (url.includes('/studentSubmissions')) {
        return json({ studentSubmissions: [{ state: 'TURNED_IN' }] });
      }
      if (url.includes('/c1/courseWork')) {
        return json({
          courseWork: [
            {
              id: 'w1',
              courseId: 'c1',
              title: 'Midterm exam',
              dueDate: { year: 2026, month: 12, day: 3 },
              dueTime: { hours: 4, minutes: 30 },
              alternateLink: 'https://classroom/c1/w1',
            },
          ],
        });
      }
      if (url.includes('/c2/courseWork')) return json({ courseWork: [] });
      if (url.includes('/announcements')) {
        return json({
          announcements: [
            {
              id: 'a1',
              courseId: 'c1',
              text: 'Class moved',
              creationTime: '2026-11-15T10:00:00Z',
            },
          ],
        });
      }
      return json({}, 404);
    });

    const snapshot = await fetchClassroomSnapshot({
      accessToken: 'token',
      now: new Date('2026-11-16T00:00:00Z'),
      deps: { fetch: fetchMock as typeof fetch },
    });
    expect(snapshot.courses).toHaveLength(2);
    expect(snapshot.work[0]).toMatchObject({
      id: 'w1',
      exam: true,
      state: 'turned-in',
      dueAt: '2026-12-03T04:30:00.000Z',
    });
    expect(snapshot.announcements[0]!.text).toBe('Class moved');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('pageToken=p2'))).toBe(true);
  });

  it('backs off on 429 and then succeeds', async () => {
    let calls = 0;
    const sleep = vi.fn(async () => {});
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return json({ error: 'rate' }, 429);
      return json({ courses: [] });
    });
    await fetchClassroomSnapshot({
      accessToken: 'token',
      deps: { fetch: fetchMock as typeof fetch, sleep },
    });
    expect(sleep).toHaveBeenCalledWith(500);
    expect(calls).toBe(2);
  });
});

describe('Gmail API client', () => {
  it('lists metadata with the inbox query and never fetches non-action bodies', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/messages?')) {
        return json({ messages: [{ id: 'm1' }, { id: 'm2' }] });
      }
      if (url.includes('format=full')) {
        const body = btoa('Report due by Friday');
        return json({
          id: 'm2',
          payload: {
            mimeType: 'text/plain',
            body: { data: body.replace(/\+/g, '-').replace(/\//g, '_') },
          },
        });
      }
      if (url.includes('/messages/m1?')) {
        return json({
          id: 'm1',
          threadId: 't1',
          snippet: 'Newsletter',
          internalDate: '1763268000000',
          payload: {
            headers: [
              { name: 'From', value: 'News <news@example.com>' },
              { name: 'Subject', value: 'Weekly digest' },
            ],
          },
        });
      }
      if (url.includes('/messages/m2?')) {
        return json({
          id: 'm2',
          threadId: 't2',
          snippet: 'Submit report',
          internalDate: '1763268000000',
          payload: {
            headers: [
              { name: 'From', value: 'University <office@university.edu>' },
              { name: 'Subject', value: 'Assignment due' },
            ],
          },
        });
      }
      return json({}, 404);
    });

    const snapshot = await fetchGmailSnapshot({
      accessToken: 'token',
      settings: {
        ...DEFAULT_INTEGRATION_SETTINGS,
        gmail: true,
        senderFilters: ['university.edu'],
      },
      deps: { fetch: fetchMock as typeof fetch },
    });
    const queryUrl = String(fetchMock.mock.calls[0]![0]);
    expect(queryUrl).toContain('from%3Auniversity.edu');
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[1]!.bodyText).toContain('Report due');
  });
});

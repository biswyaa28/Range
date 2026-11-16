import {
  classroomAnnouncementsSince,
  dedupeClassroomWork,
  mapClassroomAnnouncement,
  mapClassroomCourse,
  mapClassroomWork,
  mapGmailMessage,
  type ClassroomCourse,
  type ClassroomRawAnnouncement,
  type ClassroomRawCourse,
  type ClassroomRawWork,
  type ClassroomSnapshot,
  type ClassroomWorkItem,
  type GmailMessage,
  type GmailRawMessage,
  type GmailSnapshot,
  type IntegrationSettings,
} from '@/domain/integrations';
import { ReconnectRequiredError } from './auth';

const API = 'https://www.googleapis.com';
const MAX_PAGES = 20;
const MAX_RETRIES = 3;

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

interface FetchDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

const defaultDeps: FetchDeps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function friendlyStatus(status: number): string {
  if (status === 401) return 'Google access expired. Reconnect Google.';
  if (status === 403)
    return 'Google denied access. Check the API is enabled and your account is a test user.';
  if (status === 429) return 'Google is rate-limiting requests. Showing cached data.';
  if (status >= 500) return 'Google is unavailable right now. Showing cached data.';
  return `Google request failed (${status}).`;
}

async function getJson<T>(
  url: string,
  accessToken: string,
  deps: FetchDeps,
  attempt = 0,
): Promise<T> {
  let response: Response;
  try {
    response = await deps.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new GoogleApiError('No connection. Showing cached data.', 0);
  }

  if (response.status === 401) throw new ReconnectRequiredError();
  if (response.status === 429 && attempt < MAX_RETRIES) {
    const retryAfter = Number(response.headers.get('Retry-After'));
    const wait = Number.isFinite(retryAfter)
      ? Math.max(500, retryAfter * 1000)
      : 500 * 2 ** attempt;
    await deps.sleep(wait);
    return getJson<T>(url, accessToken, deps, attempt + 1);
  }
  if (!response.ok) throw new GoogleApiError(friendlyStatus(response.status), response.status);

  try {
    return (await response.json()) as T;
  } catch {
    throw new GoogleApiError('Google returned an unreadable response.', response.status);
  }
}

async function paged<T>(
  base: string,
  key: string,
  accessToken: string,
  deps: FetchDeps,
): Promise<T[]> {
  const out: T[] = [];
  let pageToken = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const separator = base.includes('?') ? '&' : '?';
    const url = pageToken
      ? `${base}${separator}pageToken=${encodeURIComponent(pageToken)}`
      : base;
    const data = await getJson<Record<string, unknown>>(url, accessToken, deps);
    const rows = data[key];
    if (Array.isArray(rows)) out.push(...(rows as T[]));
    const next = data['nextPageToken'];
    pageToken = typeof next === 'string' ? next : '';
    if (!pageToken) break;
  }
  return out;
}

async function submissionState(
  courseId: string,
  workId: string,
  accessToken: string,
  deps: FetchDeps,
): Promise<ClassroomWorkItem['state'] | null> {
  try {
    const data = await getJson<{
      studentSubmissions?: Array<{ state?: string }>;
    }>(
      `${API}/classroom/v1/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(
        workId,
      )}/studentSubmissions?userId=me&pageSize=1`,
      accessToken,
      deps,
    );
    const state = data.studentSubmissions?.[0]?.state;
    switch (String(state ?? '').toUpperCase()) {
      case 'TURNED_IN':
        return 'turned-in';
      case 'LATE':
        return 'late';
      case 'MISSING':
        return 'missing';
      case 'ASSIGNED':
      case 'NEW':
      case 'CREATED':
        return 'assigned';
      default:
        return null;
    }
  } catch (error) {
    // Submission state is an enhancement; missing scope or a deleted item
    // should not hide the assignment itself.
    if (error instanceof ReconnectRequiredError) throw error;
    return null;
  }
}

export interface ClassroomApiOptions {
  accessToken: string;
  now?: Date;
  deps?: Partial<FetchDeps>;
}

export async function fetchClassroomSnapshot({
  accessToken,
  now = new Date(),
  deps: overrides = {},
}: ClassroomApiOptions): Promise<ClassroomSnapshot> {
  const deps = { ...defaultDeps, ...overrides };
  const courseRows = await paged<ClassroomRawCourse>(
    `${API}/classroom/v1/courses?studentId=me&courseStates=ACTIVE&pageSize=100`,
    'courses',
    accessToken,
    deps,
  );
  const courses = courseRows
    .map(mapClassroomCourse)
    .filter((course): course is ClassroomCourse => Boolean(course));

  const work: ClassroomWorkItem[] = [];
  const announcements: ClassroomRawAnnouncement[] = [];
  for (const course of courses) {
    const rows = await paged<ClassroomRawWork>(
      `${API}/classroom/v1/courses/${encodeURIComponent(
        course.id,
      )}/courseWork?courseWorkStates=PUBLISHED&pageSize=100`,
      'courseWork',
      accessToken,
      deps,
    );
    for (const row of rows) {
      const item = mapClassroomWork(row, course);
      if (!item) continue;
      const state = await submissionState(course.id, item.id, accessToken, deps);
      work.push({ ...item, state: state ?? item.state });
    }

    const announcementRows = await paged<ClassroomRawAnnouncement>(
      `${API}/classroom/v1/courses/${encodeURIComponent(
        course.id,
      )}/announcements?announcementStates=PUBLISHED&pageSize=100`,
      'announcements',
      accessToken,
      deps,
    );
    announcements.push(...announcementRows);
  }

  const courseById = new Map(courses.map((course) => [course.id, course]));
  const mappedAnnouncements = announcements
    .map((row) => {
      const courseId = String(row.courseId ?? '');
      return mapClassroomAnnouncement(row, courseById.get(courseId));
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    courses,
    work: dedupeClassroomWork(work),
    announcements: classroomAnnouncementsSince(mappedAnnouncements, now),
    fetchedAt: now.toISOString(),
  };
}

function gmailQuery(settings: IntegrationSettings): string {
  const parts = ['in:inbox', 'newer_than:7d'];
  const senders = settings.senderFilters
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (senders.length > 0) {
    parts.push(`(${senders.map((sender) => `from:${sender}`).join(' OR ')})`);
  }
  for (const label of settings.labelFilters.map((value) => value.trim()).filter(Boolean).slice(0, 5)) {
    parts.push(`label:${label.replace(/\s+/g, '-')}`);
  }
  return parts.join(' ');
}

function base64UrlText(value: string): string {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return atob(padded);
  } catch {
    return '';
  }
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function bodyText(payload: GmailPart | undefined): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return base64UrlText(payload.body.data).slice(0, 20_000);
  }
  for (const part of payload.parts ?? []) {
    const text = bodyText(part);
    if (text) return text;
  }
  return '';
}

function needsBody(message: GmailMessage): boolean {
  const text = `${message.subject} ${message.snippet}`.toLowerCase();
  return /\b(due|deadline|submit|assignment|exam|quiz|midterm|viva|assignment|task|action)\b/.test(
    text,
  );
}

export interface GmailApiOptions {
  accessToken: string;
  settings: IntegrationSettings;
  now?: Date;
  deps?: Partial<FetchDeps>;
}

export async function fetchGmailSnapshot({
  accessToken,
  settings,
  now = new Date(),
  deps: overrides = {},
}: GmailApiOptions): Promise<GmailSnapshot> {
  const deps = { ...defaultDeps, ...overrides };
  const query = gmailQuery(settings);
  const refs = await paged<{ id?: string; threadId?: string }>(
    `${API}/gmail/v1/users/me/messages?maxResults=100&q=${encodeURIComponent(query)}`,
    'messages',
    accessToken,
    deps,
  );

  const messages: GmailMessage[] = [];
  let bodies = 0;
  for (const ref of refs.slice(0, 100)) {
    const id = String(ref.id ?? '');
    if (!id) continue;
    const metadata = await getJson<GmailRawMessage>(
      `${API}/gmail/v1/users/me/messages/${encodeURIComponent(
        id,
      )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      accessToken,
      deps,
    );
    let message = mapGmailMessage({ ...metadata, id, threadId: metadata.threadId ?? ref.threadId });
    if (!message) continue;
    if (needsBody(message) && bodies < 20) {
      bodies += 1;
      const full = await getJson<GmailRawMessage & { payload?: GmailPart }>(
        `${API}/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
        accessToken,
        deps,
      );
      const text = bodyText(full.payload);
      if (text) message = { ...message, bodyText: text };
    }
    messages.push(message);
  }

  return {
    messages,
    digest: [],
    fetchedAt: now.toISOString(),
  };
}

import { addDays, mondayIndex, toISO } from './dates';

export type IntegrationId = 'gmail' | 'classroom';

export const INTEGRATION_SCOPES: Record<IntegrationId, readonly string[]> = {
  gmail: ['https://www.googleapis.com/auth/gmail.readonly'],
  classroom: [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
    'https://www.googleapis.com/auth/classroom.announcements.readonly',
    'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
  ],
};

export const INTEGRATION_SCOPE_COPY: Record<IntegrationId, string> = {
  gmail: 'Read your inbox subjects, senders and snippets. Never mark, send or delete mail.',
  classroom:
    'Read your courses, coursework, your own submission state and announcements. You cannot submit work from this app.',
};

export const INTEGRATION_STORAGE_KEY = 'personalOS_integrations_v1';
export const INTEGRATION_TOKEN_KEY = 'integration_google_tokens';

export interface IntegrationSettings {
  gmail: boolean;
  classroom: boolean;
  /** Off by default. Sends only subject + snippet when explicitly enabled. */
  aiRead: boolean;
  senderFilters: string[];
  labelFilters: string[];
  classroomNotifications: boolean;
  includeInBackup: boolean;
}

export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = {
  gmail: false,
  classroom: false,
  aiRead: false,
  senderFilters: [],
  labelFilters: [],
  classroomNotifications: false,
  includeInBackup: false,
};

export type IntegrationConnectionState =
  | 'unavailable'
  | 'disconnected'
  | 'connected'
  | 'reconnect';

export interface IntegrationAuthStatus {
  state: IntegrationConnectionState;
  scopes: string[];
  expiresAt: string | null;
  lastError: string | null;
}

export interface ClassroomCourse {
  id: string;
  name: string;
  section: string;
  alternateLink: string;
}

export interface ClassroomWorkItem {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  description: string;
  alternateLink: string;
  /** UTC instant when Google supplied both date and time; local date only otherwise. */
  dueAt: string | null;
  dueDate: string | null;
  dueTimeKnown: boolean;
  state: 'assigned' | 'turned-in' | 'late' | 'missing' | 'unknown';
  exam: boolean;
  kind: 'assignment' | 'exam';
}

export interface ClassroomAnnouncement {
  id: string;
  courseId: string;
  courseName: string;
  text: string;
  alternateLink: string;
  createdAt: string;
}

export interface ClassroomSnapshot {
  courses: ClassroomCourse[];
  work: ClassroomWorkItem[];
  announcements: ClassroomAnnouncement[];
  fetchedAt: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  sender: string;
  senderEmail: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  bodyText?: string;
}

export type InboxKind = 'deadline' | 'exam' | 'assignment' | 'task' | 'announcement';

export interface GmailDigestItem {
  id: string;
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: string;
  dueDate: string | null;
  dueTime: string | null;
  kind: InboxKind;
  snippet: string;
  forwarded: boolean;
}

export interface GmailSnapshot {
  messages: GmailMessage[];
  digest: GmailDigestItem[];
  fetchedAt: string;
}

export interface IntegrationSnapshot {
  settings: IntegrationSettings;
  auth: IntegrationAuthStatus;
  classroom: ClassroomSnapshot | null;
  gmail: GmailSnapshot | null;
}

export function defaultIntegrationSnapshot(): IntegrationSnapshot {
  return {
    settings: { ...DEFAULT_INTEGRATION_SETTINGS },
    auth: { state: 'disconnected', scopes: [], expiresAt: null, lastError: null },
    classroom: null,
    gmail: null,
  };
}

const EXAM_WORDS =
  /\b(exam|exams|test|tests|quiz|quizzes|midterm|mid-term|viva|assessment|final)\b|\b(examen|prueba|exámen|devoir|contrôle)\b|परीक्षा/i;
const ASSIGNMENT_WORDS =
  /\b(assignment|homework|problem set|pset|project|report|essay|lab|submission|submit|deliverable)\b|\b(tarea|devoir|entrega|trabajo)\b|असाइनमेंट/i;
const TASK_WORDS =
  /\b(submit|upload|complete|finish|review|read|bring|pay|register|fill|sign|action required|todo|to-do|task)\b|\b(entregar|enviar|completar)\b/i;
const ANNOUNCEMENT_WORDS =
  /\b(announcement|notice|reminder|schedule|reschedul|class cancelled|canceled|venue|room change)\b|\b(aviso|anuncio|recordatorio)\b/i;

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  domingo: 0,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  sabado: 6,
};

export function isExamLike(title: string): boolean {
  return EXAM_WORDS.test(title);
}

export function isReadOnlyClassroomItem(item: { source?: string }): boolean {
  return item.source === 'classroom';
}

function validYmd(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month &&
    date.getUTCDate() === day
  );
}

/** Google Classroom dueDate + dueTime are UTC. Convert to a real UTC instant. */
export function classroomDueAt(
  dueDate?: { year?: number; month?: number; day?: number } | null,
  dueTime?: { hours?: number; minutes?: number } | null,
): { dueAt: string | null; dueDate: string | null; dueTimeKnown: boolean } {
  const year = dueDate?.year;
  const month = dueDate?.month;
  const day = dueDate?.day;
  if (
    typeof year !== 'number' ||
    typeof month !== 'number' ||
    typeof day !== 'number' ||
    !validYmd(year, month - 1, day)
  ) {
    return { dueAt: null, dueDate: null, dueTimeKnown: false };
  }

  const hasTime =
    typeof dueTime?.hours === 'number' &&
    typeof dueTime?.minutes === 'number' &&
    dueTime.hours >= 0 &&
    dueTime.hours <= 23 &&
    dueTime.minutes >= 0 &&
    dueTime.minutes <= 59;

  if (!hasTime) {
    return {
      dueAt: null,
      dueDate: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      dueTimeKnown: false,
    };
  }

  const at = new Date(Date.UTC(year, month - 1, day, dueTime.hours, dueTime.minutes));
  return {
    dueAt: at.toISOString(),
    dueDate: toISO(at),
    dueTimeKnown: true,
  };
}

export interface ClassroomRawCourse {
  id?: string;
  name?: string;
  section?: string;
  alternateLink?: string;
}

export interface ClassroomRawWork {
  id?: string;
  courseId?: string;
  title?: string;
  description?: string;
  alternateLink?: string;
  dueDate?: { year?: number; month?: number; day?: number };
  dueTime?: { hours?: number; minutes?: number };
  state?: string;
  submissionState?: string;
}

export interface ClassroomRawAnnouncement {
  id?: string;
  courseId?: string;
  text?: string;
  alternateLink?: string;
  creationTime?: string;
}

function submissionState(raw: ClassroomRawWork): ClassroomWorkItem['state'] {
  const value = String(raw.submissionState ?? raw.state ?? '').toUpperCase();
  if (value === 'TURNED_IN' || value === 'TURNEDIN') return 'turned-in';
  if (value === 'LATE') return 'late';
  if (value === 'MISSING') return 'missing';
  if (value === 'ASSIGNED' || value === 'NEW' || value === 'CREATED') return 'assigned';
  return 'unknown';
}

export function mapClassroomCourse(raw: ClassroomRawCourse): ClassroomCourse | null {
  const id = String(raw.id ?? '').trim();
  const name = String(raw.name ?? '').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    section: String(raw.section ?? '').trim(),
    alternateLink: String(raw.alternateLink ?? ''),
  };
}

export function mapClassroomWork(
  raw: ClassroomRawWork,
  course: ClassroomCourse | undefined,
): ClassroomWorkItem | null {
  const id = String(raw.id ?? '').trim();
  const title = String(raw.title ?? '').trim();
  if (!id || !title) return null;
  const due = classroomDueAt(raw.dueDate, raw.dueTime);
  const exam = isExamLike(title);
  return {
    id,
    courseId: String(raw.courseId ?? course?.id ?? ''),
    courseName: course?.name ?? '',
    title,
    description: String(raw.description ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    alternateLink: String(raw.alternateLink ?? ''),
    dueAt: due.dueAt,
    dueDate: due.dueDate,
    dueTimeKnown: due.dueTimeKnown,
    state: submissionState(raw),
    exam,
    kind: exam ? 'exam' : 'assignment',
  };
}

export function mapClassroomAnnouncement(
  raw: ClassroomRawAnnouncement,
  course: ClassroomCourse | undefined,
): ClassroomAnnouncement | null {
  const id = String(raw.id ?? '').trim();
  if (!id) return null;
  const text = String(raw.text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return {
    id,
    courseId: String(raw.courseId ?? course?.id ?? ''),
    courseName: course?.name ?? '',
    text,
    alternateLink: String(raw.alternateLink ?? ''),
    createdAt: String(raw.creationTime ?? ''),
  };
}

/** De-duplicates by remote id, preferring the record with a due date. */
export function dedupeClassroomWork(items: readonly ClassroomWorkItem[]): ClassroomWorkItem[] {
  const seen = new Map<string, ClassroomWorkItem>();
  for (const item of items) {
    const current = seen.get(item.id);
    if (!current) {
      seen.set(item.id, item);
      continue;
    }
    if (!current.dueAt && item.dueAt) seen.set(item.id, item);
  }
  return [...seen.values()].sort((a, b) => {
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function classroomAnnouncementsSince(
  items: readonly ClassroomAnnouncement[],
  now: Date,
  days = 14,
): ClassroomAnnouncement[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return items
    .filter((item) => {
      const at = Date.parse(item.createdAt);
      return !Number.isFinite(at) || at >= cutoff;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Read-only items for Deadlines/Plan; never persisted or synced. */
export interface ClassroomPlanItem {
  id: string;
  remoteId: string;
  title: string;
  course: string;
  due: string;
  dueAt: string | null;
  exam: boolean;
  state: ClassroomWorkItem['state'];
  alternateLink: string;
  source: 'classroom';
  readOnly: true;
}

export function classroomPlanItems(snapshot: ClassroomSnapshot | null): ClassroomPlanItem[] {
  if (!snapshot) return [];
  return dedupeClassroomWork(snapshot.work)
    .filter((item) => Boolean(item.dueDate))
    .map((item) => ({
      id: `classroom:${item.id}`,
      remoteId: item.id,
      title: item.title,
      course: item.courseName,
      due: item.dueDate as string,
      dueAt: item.dueAt,
      exam: item.exam,
      state: item.state,
      alternateLink: item.alternateLink,
      source: 'classroom',
      readOnly: true,
    }));
}

function header(headers: unknown, name: string): string {
  if (!Array.isArray(headers)) return '';
  for (const item of headers) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as { name?: unknown; value?: unknown };
    if (String(entry.name ?? '').toLowerCase() === name.toLowerCase()) {
      return String(entry.value ?? '');
    }
  }
  return '';
}

function emailOnly(sender: string): string {
  const match = sender.match(/<([^>]+)>/);
  return (match?.[1] ?? sender).trim().toLowerCase();
}

export interface GmailRawMessage {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: unknown };
  bodyText?: string;
}

export function mapGmailMessage(raw: GmailRawMessage): GmailMessage | null {
  const id = String(raw.id ?? '').trim();
  if (!id) return null;
  const sender = header(raw.payload?.headers, 'From') || 'Unknown sender';
  const subject = header(raw.payload?.headers, 'Subject') || '(no subject)';
  const dateHeader = header(raw.payload?.headers, 'Date');
  const parsedDate = Date.parse(dateHeader);
  const internal = Number(raw.internalDate);
  const receivedAt = Number.isFinite(parsedDate)
    ? new Date(parsedDate).toISOString()
    : Number.isFinite(internal) && internal > 0
      ? new Date(internal).toISOString()
      : new Date(0).toISOString();
  return {
    id,
    threadId: String(raw.threadId ?? ''),
    sender,
    senderEmail: emailOnly(sender),
    subject,
    snippet: String(raw.snippet ?? '').replace(/\s+/g, ' ').trim(),
    receivedAt,
    ...(raw.bodyText ? { bodyText: raw.bodyText.slice(0, 20_000) } : {}),
  };
}

function stripForwarded(subject: string): { subject: string; forwarded: boolean } {
  const forwarded = /^\s*(fwd?|fw)\s*:/i.test(subject);
  return { subject: subject.replace(/^\s*(fwd?|fw)\s*:\s*/gi, '').trim(), forwarded };
}

function addDaysISO(base: string, days: number): string {
  return addDays(base, days);
}

function dateFromParts(
  year: number,
  month: number,
  day: number,
  reference: Date,
): string | null {
  if (!validYmd(year, month, day)) return null;
  // A bare day/month without a year is the next occurrence, never last year.
  if (year < reference.getFullYear()) return null;
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface ParsedDue {
  date: string | null;
  time: string | null;
}

function parseTime(text: string): string | null {
  // Skip the numeric parts of a date (18/11, 2026-11-18) and require either a
  // colon or an am/pm marker so a day number is never read as an hour.
  const cleaned = text
    .replace(/\b\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9}\b/gi, ' ');
  const match = cleaned.match(
    /\b(\d{1,2})(?::(\d{2}))\s*(am|pm|a\.m\.|p\.m\.)?\b|\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)\b/i,
  );
  if (!match) return null;
  let hours = Number(match[1] ?? match[4]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = String(match[3] ?? match[5] ?? '').toLowerCase().replace(/\./g, '');
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (!meridiem && hours > 23) return null;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function parseDue(
  text: string,
  reference: Date = new Date(),
): ParsedDue {
  const clean = text.replace(/\s+/g, ' ');
  const today = toISO(reference);
  const lower = clean.toLowerCase();

  const numeric = clean.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    const dayFirst = first > 12 || second <= 12;
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    const date = dateFromParts(year, month - 1, day, reference);
    if (date) return { date, time: parseTime(lower) };
  }

  const iso = clean.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return {
      date: dateFromParts(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), reference),
      time: parseTime(lower),
    };
  }

  const monthName = clean.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${Object.keys(MONTHS).join('|')})\\b(?:\\s*,?\\s*(\\d{4}))?`,
      'i',
    ),
  );
  if (monthName) {
    const month = MONTHS[monthName[2]!.toLowerCase()]!;
    const year = monthName[3] ? Number(monthName[3]) : reference.getFullYear();
    const date = dateFromParts(year, month, Number(monthName[1]), reference);
    if (date) return { date, time: parseTime(lower) };
  }

  const monthFirst = clean.match(
    new RegExp(
      `\\b(${Object.keys(MONTHS).join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s*,?\\s*(\\d{4}))?`,
      'i',
    ),
  );
  if (monthFirst) {
    const month = MONTHS[monthFirst[1]!.toLowerCase()]!;
    const year = monthFirst[3] ? Number(monthFirst[3]) : reference.getFullYear();
    const date = dateFromParts(year, month, Number(monthFirst[2]), reference);
    if (date) return { date, time: parseTime(lower) };
  }

  if (/\btoday\b|\bआज\b/i.test(lower)) return { date: today, time: parseTime(lower) };
  if (/\btomorrow\b|\bकल\b/i.test(lower)) {
    return { date: addDaysISO(today, 1), time: parseTime(lower) };
  }
  if (/\bday after tomorrow\b/i.test(lower)) {
    return { date: addDaysISO(today, 2), time: parseTime(lower) };
  }

  const weekdayMatch = lower.match(
    new RegExp(
      `\\b(?:by|before|on|due|this|next)?\\s*(${Object.keys(WEEKDAYS).join('|')})\\b`,
      'i',
    ),
  );
  if (weekdayMatch) {
    const target = WEEKDAYS[weekdayMatch[1]!.toLowerCase()]!;
    const current = reference.getDay();
    let delta = (target - current + 7) % 7;
    if (/\bnext\b/i.test(lower) && delta === 0) delta = 7;
    return { date: addDaysISO(today, delta), time: parseTime(lower) };
  }

  if (/\bnext week\b/i.test(lower)) {
    const monday = mondayIndex(reference) === 0 ? 7 : 7 - mondayIndex(reference);
    return { date: addDaysISO(today, monday), time: parseTime(lower) };
  }

  return { date: null, time: null };
}

function digestKind(text: string, subject: string): InboxKind {
  if (isExamLike(text)) return 'exam';
  if (ASSIGNMENT_WORDS.test(text) || ASSIGNMENT_WORDS.test(subject)) return 'assignment';
  if (TASK_WORDS.test(text)) return 'task';
  if (ANNOUNCEMENT_WORDS.test(text)) return 'announcement';
  return 'task';
}

export interface ExtractOptions {
  now?: Date;
  senderFilters?: readonly string[];
  labelFilters?: readonly string[];
}

function senderMatches(message: GmailMessage, filters: readonly string[]): boolean {
  if (filters.length === 0) return true;
  return filters.some((filter) => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return false;
    return message.senderEmail.includes(needle) || message.sender.toLowerCase().includes(needle);
  });
}

/** Local-only extraction. No network, no logging, no raw bodies kept in results. */
export function extractGmailDigest(
  messages: readonly GmailMessage[],
  options: ExtractOptions = {},
): GmailDigestItem[] {
  const now = options.now ?? new Date();
  const senders = options.senderFilters ?? [];
  const out: GmailDigestItem[] = [];

  for (const message of messages) {
    if (!senderMatches(message, senders)) continue;
    const forwardedInfo = stripForwarded(message.subject);
    const body = message.bodyText ? message.bodyText.replace(/<[^>]*>/g, ' ') : '';
    const content = `${message.subject} ${message.snippet} ${body}`.replace(/\s+/g, ' ').trim();
    if (
      !EXAM_WORDS.test(content) &&
      !ASSIGNMENT_WORDS.test(content) &&
      !TASK_WORDS.test(content) &&
      !ANNOUNCEMENT_WORDS.test(content)
    ) {
      continue;
    }

    const due = parseDue(content, now);
    const kind = digestKind(content, forwardedInfo.subject);
    out.push({
      id: `gmail:${message.id}`,
      messageId: message.id,
      sender: message.sender,
      subject: forwardedInfo.subject || message.subject,
      receivedAt: message.receivedAt,
      dueDate: due.date,
      dueTime: due.time,
      kind,
      snippet: message.snippet.slice(0, 280),
      forwarded: forwardedInfo.forwarded,
    });
  }

  return out
    .sort((a, b) => {
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return b.receivedAt.localeCompare(a.receivedAt);
    })
    .slice(0, 100);
}

export interface AiEmailPayload {
  sender: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

/**
 * The only data allowed to leave the device for an AI summary. Bodies and
 * addresses beyond the display sender are excluded by construction.
 */
export function buildAiPayload(messages: readonly GmailMessage[]): AiEmailPayload[] {
  return messages.map((message) => ({
    sender: message.sender,
    subject: message.subject,
    snippet: message.snippet.slice(0, 280),
    receivedAt: message.receivedAt,
  }));
}

export function integrationScopeUnion(settings: IntegrationSettings): string[] {
  const scopes = new Set<string>();
  if (settings.gmail) INTEGRATION_SCOPES.gmail.forEach((scope) => scopes.add(scope));
  if (settings.classroom) INTEGRATION_SCOPES.classroom.forEach((scope) => scopes.add(scope));
  return [...scopes];
}

export function integrationIsAvailable(platform: string, native: boolean): boolean {
  return native && platform !== 'web';
}

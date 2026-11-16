import { describe, expect, it } from 'vitest';
import {
  buildAiPayload,
  classroomDueAt,
  classroomPlanItems,
  dedupeClassroomWork,
  extractGmailDigest,
  isExamLike,
  mapClassroomAnnouncement,
  mapClassroomCourse,
  mapClassroomWork,
  mapGmailMessage,
  parseDue,
} from '@/domain/integrations';
import { toISO } from '@/domain/dates';

const course = mapClassroomCourse({
  id: 'c1',
  name: 'Operating Systems',
  section: 'CSE-4A',
  alternateLink: 'https://classroom.google.com/c/c1',
})!;

describe('Classroom mapping', () => {
  it('maps coursework and treats dueDate/dueTime as UTC', () => {
    const item = mapClassroomWork(
      {
        id: 'w1',
        courseId: 'c1',
        title: 'OS Midterm Exam',
        description: '<b>Bring</b> a pen',
        dueDate: { year: 2026, month: 12, day: 1 },
        dueTime: { hours: 9, minutes: 30 },
        submissionState: 'TURNED_IN',
        alternateLink: 'https://classroom.google.com/c/c1/a/w1',
      },
      course,
    )!;
    expect(item.exam).toBe(true);
    expect(item.kind).toBe('exam');
    expect(item.dueAt).toBe('2026-12-01T09:30:00.000Z');
    expect(item.dueDate).toBe(toISO(new Date('2026-12-01T09:30:00.000Z')));
    expect(item.state).toBe('turned-in');
    expect(item.description).toBe('Bring a pen');
  });

  it('keeps date-only work readable and rejects invalid dates', () => {
    const dateOnly = classroomDueAt({ year: 2026, month: 2, day: 29 }, null);
    expect(dateOnly).toEqual({ dueAt: null, dueDate: null, dueTimeKnown: false });
    const valid = classroomDueAt({ year: 2026, month: 11, day: 16 }, undefined);
    expect(valid.dueDate).toBe('2026-11-16');
  });

  it('maps announcements and de-duplicates by id', () => {
    const announcement = mapClassroomAnnouncement(
      { id: 'a1', courseId: 'c1', text: '<p>Class moved</p>', creationTime: '2026-11-15T10:00:00Z' },
      course,
    )!;
    expect(announcement.text).toBe('Class moved');
    expect(announcement.courseName).toBe('Operating Systems');

    const one = mapClassroomWork({ id: 'x', title: 'Quiz', dueDate: { year: 2026, month: 11, day: 20 } }, course)!;
    const duplicate = { ...one, title: 'Quiz duplicate', dueDate: '2026-11-21', dueAt: '2026-11-21T00:00:00Z' };
    const deduped = dedupeClassroomWork([one, duplicate]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.title).toBe('Quiz duplicate');
  });

  it('creates read-only plan items only for dated work', () => {
    const work = mapClassroomWork({ id: 'due', title: 'Problem Set 3', dueDate: { year: 2026, month: 11, day: 18 } }, course)!;
    const undated = mapClassroomWork({ id: 'none', title: 'Reading' }, course)!;
    const items = classroomPlanItems({
      courses: [course],
      work: [work, undated],
      announcements: [],
      fetchedAt: '2026-11-16T00:00:00Z',
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: 'classroom', readOnly: true, due: '2026-11-18' });
  });
});

describe('Gmail extraction', () => {
  const now = new Date('2026-11-16T08:00:00');

  function message(overrides: Record<string, unknown> = {}) {
    return mapGmailMessage({
      id: 'm1',
      threadId: 't1',
      snippet: 'Submit the assignment by Friday at 5 pm IST',
      internalDate: String(now.getTime()),
      payload: {
        headers: [
          { name: 'From', value: 'ITM University <exam@itm.edu>' },
          { name: 'Subject', value: 'Fwd: DBMS assignment' },
          { name: 'Date', value: 'Mon, 16 Nov 2026 09:00:00 +0530' },
        ],
      },
      ...overrides,
    })!;
  }

  it('extracts due dates, exam/assignment kinds and strips forward prefixes', () => {
    const digest = extractGmailDigest([message()], { now });
    expect(digest).toHaveLength(1);
    expect(digest[0]).toMatchObject({
      subject: 'DBMS assignment',
      forwarded: true,
      kind: 'assignment',
      dueDate: '2026-11-20',
      dueTime: '17:00',
    });
  });

  it('handles numeric and month-name dates, including IST dates', () => {
    expect(parseDue('last date 18/11/2026 before 11:59 pm', now)).toEqual({
      date: '2026-11-18',
      time: '23:59',
    });
    expect(parseDue('viva on 2 Dec 2026 at 10:00 am', now)).toEqual({
      date: '2026-12-02',
      time: '10:00',
    });
  });

  it('defaults numeric dates to day-first and accepts two-digit years', () => {
    expect(parseDue('submit 05/09/2026', now).date).toBe('2026-09-05');
    expect(parseDue('submit 18/11/2026', now).date).toBe('2026-11-18');
    expect(parseDue('submit 05/18/2026', now).date).toBe('2026-05-18');
    expect(parseDue('submit 05/09/26', now).date).toBe('2026-09-05');
    expect(parseDue('submit 18-11-26', now).date).toBe('2026-11-18');
  });

  it('does not invent dates for noisy non-English mail', () => {
    const digest = extractGmailDigest(
      [
        message({
          snippet: 'परीक्षा की तैयारी करें। Examen de práctica el viernes.',
          payload: {
            headers: [
              { name: 'From', value: 'University <office@university.edu>' },
              { name: 'Subject', value: 'Notificación general' },
              { name: 'Date', value: 'Mon, 16 Nov 2026 09:00:00 +0530' },
            ],
          },
        }),
      ],
      { now },
    );
    expect(digest).toHaveLength(1);
    expect(digest[0]!.kind).toBe('exam');
    expect(digest[0]!.dueDate).toBe('2026-11-20');
  });

  it('accepts HTML-only mail without keeping HTML in the output', () => {
    const item = message({ bodyText: '<html><body><b>Submit</b> report by 2026-11-19</body></html>' });
    const digest = extractGmailDigest([item], { now });
    expect(digest[0]!.dueDate).toBe('2026-11-19');
    expect(JSON.stringify(digest)).not.toContain('<b>');
  });

  it('respects sender filters and never includes a body in the AI payload', () => {
    const filtered = extractGmailDigest([message()], {
      now,
      senderFilters: ['@other.edu'],
    });
    expect(filtered).toHaveLength(0);

    const payload = buildAiPayload([message({ bodyText: 'SECRET BODY' })]);
    expect(JSON.stringify(payload)).not.toContain('SECRET BODY');
    expect(payload[0]).toHaveProperty('subject');
    expect(payload[0]).toHaveProperty('snippet');
    expect(payload[0]).not.toHaveProperty('bodyText');
  });

  it('tags exam-like titles', () => {
    expect(isExamLike('Viva assessment')).toBe(true);
    expect(isExamLike('Library notice')).toBe(false);
  });
});

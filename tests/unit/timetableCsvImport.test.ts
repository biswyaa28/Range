import { describe, expect, it } from 'vitest';
import {
  parseTimetableItems,
  validateTimetableImport,
} from '@/domain/timetableImport';

const HEADER = 'day,start,end,title,type\n';

describe('CSV timetable import', () => {
  it('parses a valid CSV with a header in any column order', () => {
    const result = validateTimetableImport(
      'title,type,day,start,end\n' +
        'DSA lecture,class,Monday,09:00,10:00\n' +
        '"Physics, lab",class,Tuesday,14:00,16:00\n',
    );
    expect(result.fatal).toBeUndefined();
    expect(result.errors).toEqual([]);
    expect(result.valid).toMatchObject([
      { row: 1, title: 'DSA lecture', day: 0, start: '09:00', end: '10:00', category: 'class' },
      { row: 2, title: 'Physics, lab', day: 1, start: '14:00', end: '16:00', category: 'class' },
    ]);
    expect(parseTimetableItems(HEADER + 'Monday,09:00,10:00,Lab,class')).toEqual([
      { day: 'Monday', start: '09:00', end: '10:00', title: 'Lab', category: 'class' },
    ]);
  });

  it('reports clear per-row errors and keeps valid rows', () => {
    const result = validateTimetableImport(
      HEADER +
        'Monday,09:00,10:00,Ok,class\r\n' +
        'Funday,25:00,10:00,Bad day,class\r\n' +
        'Tuesday,10:00,09:00,Backwards,study\r\n' +
        ',11:00,12:00,No day,class\r\n',
    );
    expect(result.valid).toHaveLength(1);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { row: 2, reason: 'Unknown day (use 0–6, a weekday name or YYYY-MM-DD)' },
        { row: 2, reason: 'Start must be HH:MM' },
        { row: 3, reason: 'End must be after start' },
        { row: 4, reason: 'Unknown day (use 0–6, a weekday name or YYYY-MM-DD)' },
      ]),
    );
  });

  it('rejects a CSV without a header row', () => {
    const result = validateTimetableImport('Monday,09:00,10:00,Lab,class');
    expect(result.valid).toEqual([]);
    expect(result.fatal).toBe('CSV needs a header row: day,start,end,title,type.');
  });

  it('still accepts JSON input', () => {
    const result = validateTimetableImport(
      JSON.stringify([{ title: 'DSA', day: 0, start: '09:00', end: '10:00' }]),
    );
    expect(result.valid).toHaveLength(1);
  });
});

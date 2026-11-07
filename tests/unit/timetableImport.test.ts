import { describe, it, expect } from 'vitest';
import { validateTimetableImport, normalizeImportDay } from '@/domain/timetableImport';

describe('domain timetableImport validator', () => {
  it('normalizes day representations (0-6, weekday strings, YYYY-MM-DD)', () => {
    expect(normalizeImportDay(0)).toBe(0);
    expect(normalizeImportDay(6)).toBe(6);
    expect(normalizeImportDay(7)).toBeNull();
    expect(normalizeImportDay('Monday')).toBe(0);
    expect(normalizeImportDay('mon')).toBe(0);
    expect(normalizeImportDay('Tuesday')).toBe(1);
    expect(normalizeImportDay('Sun')).toBe(6);
    expect(normalizeImportDay('2026-05-20')).toBe('2026-05-20');
    expect(normalizeImportDay('invalid-day')).toBeNull();
  });

  it('1. validates valid array of blocks', () => {
    const json = JSON.stringify([
      { title: 'DSA Lecture', day: 'Monday', start: '09:00', end: '10:00' },
      { title: 'Calculus', day: 1, start: '11:00', end: '12:30' },
      { title: 'Workshop', day: '2026-05-20', start: '14:00', end: '16:00' },
    ]);
    const res = validateTimetableImport(json);
    expect(res.fatal).toBeUndefined();
    expect(res.errors.length).toBe(0);
    expect(res.valid.length).toBe(3);
    expect(res.valid[0]?.day).toBe(0);
    expect(res.valid[1]?.day).toBe(1);
    expect(res.valid[2]?.day).toBe('2026-05-20');
  });

  it('2. validates valid object containing blocks array', () => {
    const json = JSON.stringify({
      blocks: [
        { title: 'Lab', day: 2, start: '13:00', end: '15:00' },
      ],
    });
    const res = validateTimetableImport(json);
    expect(res.valid.length).toBe(1);
    expect(res.errors.length).toBe(0);
  });

  it('3. rejects invalid JSON with fatal error', () => {
    const res = validateTimetableImport('{ bad json: true ');
    expect(res.fatal).toMatch(/Invalid JSON/);
    expect(res.valid.length).toBe(0);
  });

  it('4. rejects empty array or non-array root with fatal error', () => {
    const resEmpty = validateTimetableImport('[]');
    expect(resEmpty.fatal).toBe('The list is empty.');

    const resObj = validateTimetableImport('{"somethingElse": 123}');
    expect(resObj.fatal).toMatch(/Expected a JSON array/);
  });

  it('5. detects missing title in row', () => {
    const json = JSON.stringify([
      { day: 0, start: '09:00', end: '10:00' },
    ]);
    const res = validateTimetableImport(json);
    expect(res.valid.length).toBe(0);
    expect(res.errors.some((e) => e.reason === 'Missing title')).toBe(true);
  });

  it('6. detects invalid or missing day in row', () => {
    const json = JSON.stringify([
      { title: 'Valid', day: 'Funday', start: '09:00', end: '10:00' },
    ]);
    const res = validateTimetableImport(json);
    expect(res.errors.some((e) => e.reason.includes('Unknown day'))).toBe(true);
  });

  it('7. detects bad time format in start/end', () => {
    const json = JSON.stringify([
      { title: 'Valid', day: 0, start: '9am', end: '10:00' },
      { title: 'Valid 2', day: 0, start: '09:00', end: '25:00' },
    ]);
    const res = validateTimetableImport(json);
    expect(res.errors.some((e) => e.reason === 'Start must be HH:MM')).toBe(true);
    expect(res.errors.some((e) => e.reason === 'End must be HH:MM')).toBe(true);
  });

  it('8. detects end time <= start time', () => {
    const json = JSON.stringify([
      { title: 'Reverse Time', day: 0, start: '14:00', end: '13:00' },
      { title: 'Zero Duration', day: 0, start: '10:00', end: '10:00' },
    ]);
    const res = validateTimetableImport(json);
    expect(res.errors.filter((e) => e.reason === 'End must be after start').length).toBe(2);
  });

  it('9. isolates non-object rows and reports row index', () => {
    const json = JSON.stringify([
      'not an object',
      null,
      { title: 'Good', day: 0, start: '08:00', end: '09:00' },
    ]);
    const res = validateTimetableImport(json);
    expect(res.valid.length).toBe(1);
    expect(res.errors[0]?.row).toBe(1);
    expect(res.errors[1]?.row).toBe(2);
  });
});

import { describe, it, expect } from 'vitest';
import { formatTime, formatTimeHM } from '@/domain/dates';

describe('formatTime', () => {
  it('renders 24-hour times', () => {
    expect(formatTime(0, '24h')).toBe('00:00');
    expect(formatTime(9 * 60 + 5, '24h')).toBe('09:05');
    expect(formatTime(23 * 60 + 59, '24h')).toBe('23:59');
  });

  it('renders midnight and noon in 12-hour time', () => {
    expect(formatTime(0, '12h')).toBe('12:00 AM');
    expect(formatTime(12 * 60, '12h')).toBe('12:00 PM');
  });

  it('renders 12:05 pm and morning times', () => {
    expect(formatTime(12 * 60 + 5, '12h')).toBe('12:05 PM');
    expect(formatTime(9 * 60 + 5, '12h')).toBe('9:05 AM');
    expect(formatTime(23 * 60 + 59, '12h')).toBe('11:59 PM');
  });

  it('formats stored HH:MM values and wraps out-of-range minutes', () => {
    expect(formatTimeHM('13:30', '12h')).toBe('1:30 PM');
    expect(formatTimeHM('13:30', '24h')).toBe('13:30');
    expect(formatTime(1440, '24h')).toBe('00:00');
  });
});

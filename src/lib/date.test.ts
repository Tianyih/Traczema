import { afterAll, describe, expect, it } from 'vitest';
import { addDaysISO, diffDays, eachDayISO, formatISO, fromISODate, isISODate, toISODate, todayISO } from './date';
import { d } from '@/test/factories';

const originalTZ = process.env.TZ;
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

describe('isISODate', () => {
  it('accepts real calendar dates only', () => {
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2023-02-29')).toBe(false);
    expect(isISODate('2024-02-30')).toBe(false);
    expect(isISODate('2024-2-3')).toBe(false);
    expect(isISODate('not a date')).toBe(false);
    expect(isISODate(20240101)).toBe(false);
  });
});

// Every assertion below must hold regardless of the machine's time zone, including across DST changes.
describe.each(['America/New_York', 'Europe/London', 'Asia/Shanghai', 'Australia/Sydney', 'Pacific/Auckland'])(
  'calendar math in %s',
  (tz) => {
    it('round-trips and never shifts the day', () => {
      process.env.TZ = tz;
      for (const s of ['2024-01-01', '2024-03-10', '2024-03-31', '2024-10-06', '2024-11-03', '2024-12-31']) {
        expect(toISODate(fromISODate(d(s)))).toBe(s);
      }
    });

    it('diffDays / addDaysISO / eachDayISO are DST-safe', () => {
      process.env.TZ = tz;
      // Spans the northern-spring and southern-spring DST transitions.
      expect(diffDays(d('2024-03-11'), d('2024-03-09'))).toBe(2);
      expect(diffDays(d('2024-10-07'), d('2024-10-05'))).toBe(2);
      expect(diffDays(d('2024-12-31'), d('2024-01-01'))).toBe(365); // leap year
      expect(addDaysISO(d('2024-03-09'), 1)).toBe('2024-03-10');
      expect(addDaysISO(d('2024-03-09'), 2)).toBe('2024-03-11');
      expect(addDaysISO(d('2024-02-28'), 2)).toBe('2024-03-01');
      const days = eachDayISO(d('2024-03-08'), d('2024-03-12'));
      expect(days).toEqual(['2024-03-08', '2024-03-09', '2024-03-10', '2024-03-11', '2024-03-12']);
    });

    it('todayISO uses the LOCAL calendar day', () => {
      process.env.TZ = tz;
      expect(todayISO(new Date(2024, 5, 15, 23, 59, 59))).toBe('2024-06-15');
      expect(todayISO(new Date(2024, 5, 15, 0, 0, 1))).toBe('2024-06-15');
    });
  },
);

describe('eachDayISO / formatISO', () => {
  it('is empty when to < from and single-day when equal', () => {
    expect(eachDayISO(d('2024-01-05'), d('2024-01-04'))).toEqual([]);
    expect(eachDayISO(d('2024-01-05'), d('2024-01-05'))).toEqual(['2024-01-05']);
  });
  it('formats with a supplied format string', () => {
    expect(formatISO(d('2024-03-09'), 'yyyy/MM/dd')).toBe('2024/03/09');
  });
});

import { describe, expect, it } from 'vitest';
import { enUS, zhCN } from 'date-fns/locale';
import { buildGrid, dataRange, isSameMonth, shiftAnchor, weekdayLabels } from './calendar';
import { d } from '@/test/factories';

describe('calendar grid', () => {
  it('month grid (Sunday start): whole weeks covering the month', () => {
    const g = buildGrid(d('2024-02-15'), 'month', 0);
    expect(g.from).toBe('2024-01-28'); // Feb 1 2024 is a Thursday -> week starts Sun Jan 28
    expect(g.to).toBe('2024-03-02');
    expect(g.weeks).toHaveLength(5);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    expect(g.weeks[0]?.[0]).toBe('2024-01-28');
    expect(g.weeks[4]?.[6]).toBe('2024-03-02');
  });

  it('month grid (Monday start) differs and can need 6 rows', () => {
    const g = buildGrid(d('2024-06-10'), 'month', 1);
    expect(g.from).toBe('2024-05-27');
    expect(g.to).toBe('2024-06-30');
    expect(g.weeks).toHaveLength(5);
    // Oct 1 2023 is a Sunday, the LAST column of a Monday-start week -> the month needs 6 rows.
    expect(buildGrid(d('2023-10-10'), 'month', 1).weeks).toHaveLength(6);
  });

  it('is DST-safe: consecutive days never skip or repeat across a transition', () => {
    for (const month of ['2024-03-15', '2024-10-15', '2024-11-15']) {
      const days = buildGrid(d(month), 'month', 0).weeks.flat();
      expect(new Set(days).size).toBe(days.length);
      for (let i = 1; i < days.length; i++) expect(days[i]! > days[i - 1]!).toBe(true);
    }
  });

  it('week view is the 7 days containing the anchor', () => {
    const g = buildGrid(d('2024-03-14'), 'week', 1);
    expect(g.weeks).toEqual([['2024-03-11', '2024-03-12', '2024-03-13', '2024-03-14', '2024-03-15', '2024-03-16', '2024-03-17']]);
    expect(g.from).toBe('2024-03-11');
    expect(g.to).toBe('2024-03-17');
  });

  it('shiftAnchor moves by month (clamping the day) or by week', () => {
    expect(shiftAnchor(d('2024-01-31'), 'month', 1)).toBe('2024-02-29');
    expect(shiftAnchor(d('2024-03-31'), 'month', -1)).toBe('2024-02-29');
    expect(shiftAnchor(d('2024-12-15'), 'month', 1)).toBe('2025-01-15');
    expect(shiftAnchor(d('2024-03-10'), 'week', 1)).toBe('2024-03-17');
    expect(shiftAnchor(d('2024-03-10'), 'week', -1)).toBe('2024-03-03');
  });

  it('isSameMonth', () => {
    expect(isSameMonth(d('2024-03-01'), d('2024-03-31'))).toBe(true);
    expect(isSameMonth(d('2024-03-31'), d('2024-04-01'))).toBe(false);
  });

  it('weekday labels follow the locale and its first day of the week', () => {
    expect(weekdayLabels(0, enUS)).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
    expect(weekdayLabels(1, zhCN, 'EEEEE')).toEqual(['一', '二', '三', '四', '五', '六', '日']);
  });
});

describe('dataRange (no frames for the future)', () => {
  it('clamps the end of a grid to today', () => {
    expect(dataRange({ from: d('2024-05-26'), to: d('2024-06-29') }, d('2024-06-10'))).toEqual({ from: '2024-05-26', to: '2024-06-10' });
  });
  it('leaves a fully-past grid untouched, and yields an empty range for a fully-future grid', () => {
    expect(dataRange({ from: d('2024-04-28'), to: d('2024-06-01') }, d('2024-06-10'))).toEqual({ from: '2024-04-28', to: '2024-06-01' });
    const future = dataRange({ from: d('2024-07-01'), to: d('2024-07-31') }, d('2024-06-10'));
    expect(future.to < future.from).toBe(true); // buildFrames turns this into zero frames
  });
});

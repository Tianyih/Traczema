import { describe, expect, it } from 'vitest';
import { canOverrideBedding, collectBeddingResets, deriveBeddingForDate, deriveBeddingSeries } from './bedding';
import { d, dailyLog } from '@/test/factories';

const wash = (date: string) => dailyLog(d(date), { bedding: { washedToday: true, assumedLastWashDate: null } });
const noWash = (date: string) => dailyLog(d(date), { bedding: { washedToday: false, assumedLastWashDate: null } });

describe('days since bedding wash (derived, never typed)', () => {
  it('is 0 on the wash day and counts up from the most recent wash', () => {
    const logs = [wash('2024-05-03'), noWash('2024-05-10')];
    const s = deriveBeddingSeries(logs, d('2024-05-02'), d('2024-05-11'));
    expect(s.map((x) => x.daysSinceWash)).toEqual([null, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s[0]?.source).toBeNull();
    expect(s[1]?.source).toBe('logged');
  });

  it('a later wash resets the counter', () => {
    const logs = [wash('2024-05-03'), wash('2024-05-08')];
    const s = deriveBeddingSeries(logs, d('2024-05-07'), d('2024-05-10'));
    expect(s.map((x) => x.daysSinceWash)).toEqual([4, 0, 1, 2]);
    expect(s[3]?.lastResetDate).toBe('2024-05-08');
  });

  it('is computed for days that have no log at all', () => {
    expect(deriveBeddingForDate([wash('2024-05-01')], d('2024-05-20')).daysSinceWash).toBe(19);
  });

  it('uses a manual anchor ("N days ago" stored as a date) when no wash is known', () => {
    const logs = [dailyLog(d('2024-05-10'), { bedding: { washedToday: false, assumedLastWashDate: d('2024-05-04') } })];
    const s = deriveBeddingSeries(logs, d('2024-05-03'), d('2024-05-12'));
    expect(s.map((x) => x.daysSinceWash)).toEqual([null, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s[1]?.source).toBe('assumed');
  });

  it('an explicit wash supersedes an older assumption', () => {
    const logs = [
      dailyLog(d('2024-05-10'), { bedding: { washedToday: false, assumedLastWashDate: d('2024-05-01') } }),
      wash('2024-05-12'),
    ];
    expect(deriveBeddingForDate(logs, d('2024-05-11')).daysSinceWash).toBe(10);
    expect(deriveBeddingForDate(logs, d('2024-05-13')).daysSinceWash).toBe(1);
    expect(deriveBeddingForDate(logs, d('2024-05-13')).source).toBe('logged');
  });

  it('an explicit wash wins when it falls on the same date as an anchor', () => {
    const logs = [
      dailyLog(d('2024-05-05'), { bedding: { washedToday: true, assumedLastWashDate: d('2024-05-05') } }),
    ];
    expect(collectBeddingResets(logs)).toEqual([{ date: '2024-05-05', source: 'logged' }]);
  });

  it('ignores logs without a bedding section, and is unknown with no history at all', () => {
    expect(deriveBeddingForDate([dailyLog(d('2024-05-01'))], d('2024-05-05')).daysSinceWash).toBeNull();
    expect(deriveBeddingForDate([], d('2024-05-05'))).toEqual({ daysSinceWash: null, lastResetDate: null, source: null });
  });

  it('uses resets from before the requested range', () => {
    const s = deriveBeddingSeries([wash('2024-01-01')], d('2024-03-01'), d('2024-03-02'));
    expect(s[0]?.daysSinceWash).toBe(60); // 2024 is a leap year: Jan 1 -> Mar 1 = 60 days
  });

  it('offers the manual override only when no explicit wash exists on or before the date', () => {
    const logs = [wash('2024-05-05')];
    expect(canOverrideBedding(logs, d('2024-05-04'))).toBe(true);
    expect(canOverrideBedding(logs, d('2024-05-05'))).toBe(false);
    expect(canOverrideBedding(logs, d('2024-05-09'))).toBe(false);
  });
});

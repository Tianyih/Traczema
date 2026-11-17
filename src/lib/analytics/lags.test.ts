import { describe, expect, it } from 'vitest';
import { alignFrames, LAGS } from './lags';
import { addDaysISO, type ISODate } from '@/lib/date';
import { d, frame } from '@/test/factories';

/** Ten consecutive days whose severity equals the day number (1..10). */
const days = Array.from({ length: 10 }, (_, i) => addDaysISO(d('2024-05-01'), i));
const frames = days.map((date, i) => frame(date, { severity: i + 1, tempC: 10 + i }));
const outcomes = (a: ReturnType<typeof alignFrames>) => a.map((x) => [x.date, x.outcome] as [ISODate, number]);

describe('lag alignment (exposure day t vs outcome window)', () => {
  it('defines the four windows', () => {
    expect([LAGS.T0, LAGS.T1, LAGS.T2, LAGS.W48].map((l) => [l.startOffset, l.endOffset])).toEqual([[0, 0], [1, 1], [2, 2], [1, 2]]);
  });

  it('T0: same-day severity', () => {
    const a = alignFrames(frames, { lag: 'T0' });
    expect(a).toHaveLength(10);
    expect(a[0]).toMatchObject({ date: '2024-05-01', outcome: 1 });
    expect(a[9]).toMatchObject({ date: '2024-05-10', outcome: 10 });
  });

  it('T1: outcome of day t is the severity of t+1; the last day has no outcome', () => {
    const a = alignFrames(frames, { lag: 'T1' });
    expect(a).toHaveLength(9);
    expect(outcomes(a)[0]).toEqual(['2024-05-01', 2]);
    expect(outcomes(a)[8]).toEqual(['2024-05-09', 10]);
  });

  it('T2: outcome of day t is the severity of t+2', () => {
    const a = alignFrames(frames, { lag: 'T2' });
    expect(a).toHaveLength(8);
    expect(outcomes(a)[0]).toEqual(['2024-05-01', 3]);
  });

  it('W48: MAX severity over days t+1..t+2; the last day still has one known day', () => {
    const a = alignFrames(frames, { lag: 'W48' });
    expect(a).toHaveLength(9);
    expect(outcomes(a)[0]).toEqual(['2024-05-01', 3]);
    expect(outcomes(a)[7]).toEqual(['2024-05-08', 10]);
    expect(outcomes(a)[8]).toEqual(['2024-05-09', 10]); // only t+1 exists
  });

  it('aligns by CALENDAR date, not array position (a missing day is a gap)', () => {
    const gappy = frames.filter((f) => f.date !== '2024-05-03'); // no frame for May 3
    const a = alignFrames(gappy, { lag: 'T1' });
    expect(a.find((x) => x.date === '2024-05-02')).toBeUndefined(); // its outcome day (May 3) is missing
    expect(a.find((x) => x.date === '2024-05-04')?.outcome).toBe(5);
  });

  it('skips unknown outcomes instead of treating them as 0, and W48 uses whichever day is known', () => {
    const f = frames.map((x) => (x.date === '2024-05-04' ? { ...x, severity: null } : x));
    expect(alignFrames(f, { lag: 'T0' }).some((x) => x.date === '2024-05-04')).toBe(false);
    expect(alignFrames(f, { lag: 'T1' }).some((x) => x.date === '2024-05-03')).toBe(false);
    // May 3: window = May 4 (unknown) + May 5 (= 5) -> uses the one known day.
    expect(alignFrames(f, { lag: 'W48' }).find((x) => x.date === '2024-05-03')?.outcome).toBe(5);
    // May 2: window = May 3 (= 3) + May 4 (unknown) -> 3.
    expect(alignFrames(f, { lag: 'W48' }).find((x) => x.date === '2024-05-02')?.outcome).toBe(3);
  });

  it('filters by exposure date range', () => {
    const a = alignFrames(frames, { lag: 'T0', from: d('2024-05-03'), to: d('2024-05-05') });
    expect(a.map((x) => x.date)).toEqual(['2024-05-03', '2024-05-04', '2024-05-05']);
  });

  it('uses a region\'s carried-forward severity when a region is selected', () => {
    const rf = frames.map((f, i) => ({ ...f, regionSeverity: { ...f.regionSeverity, neck: i % 2 === 0 ? 9 : null } }));
    const a = alignFrames(rf, { lag: 'T0', regionId: 'neck' });
    expect(a).toHaveLength(5);
    expect(a.every((x) => x.outcome === 9)).toBe(true);
  });

  it('onsetOnly drops exposure days that were already in flare (severity >= 6)', () => {
    const a = alignFrames(frames, { lag: 'T1', onsetOnly: true });
    expect(a.map((x) => x.date)).toEqual(['2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04', '2024-05-05']);
  });
});

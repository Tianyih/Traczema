import { describe, expect, it } from 'vitest';
import { forwardAnalysis } from './forward';
import { buildRegistry, findVariable } from './variables';
import type { AlignedDay } from './types';
import { addDaysISO } from '@/lib/date';
import { d, frame } from '@/test/factories';
import type { SweatLevel } from '@/db/types';

const reg = buildRegistry();
const sweat = findVariable(reg, 'sweat');

function align(rows: [SweatLevel | null, number[]][]): AlignedDay[] {
  const out: AlignedDay[] = [];
  let i = 0;
  for (const [s, outcomes] of rows) {
    for (const outcome of outcomes) {
      const date = addDaysISO(d('2024-01-01'), i++);
      out.push({ date, exposure: frame(date, { sweat: s }), outcome });
    }
  }
  return out;
}

describe('forwardAnalysis (variable -> severity)', () => {
  const aligned = align([
    ['none', [1, 2, 2, 3, 2, 1, 2, 3]], //            mean 2.0   flares 0
    ['light', [3, 4, 4, 5, 3, 4]], //                 mean 3.8333
    ['moderate', [5, 6, 6, 7, 5, 6]], //              mean 5.8333 flares 3 (6,6,7... wait 6,6,7,6 = 4)
    ['heavy', [8, 9, 7, 6, 8, 9, 10, 8]], //          mean 8.125  flares 8
  ]);

  it('computes per-level mean, median, quartiles and flare probability', () => {
    const r = forwardAnalysis(aligned, sweat, { lag: 'T0' });
    const by = (k: string) => r.levels.find((l) => l.factorKey === k)!;

    expect(by('sweat:none')).toMatchObject({ n: 8, mean: 2, median: 2, min: 1, max: 3, flareCount: 0, flareProb: 0 });
    expect(by('sweat:heavy')).toMatchObject({ n: 8, flareCount: 8, flareProb: 1, median: 8, min: 6, max: 10 });
    expect(by('sweat:heavy').mean).toBeCloseTo(65 / 8, 12);
    expect(by('sweat:moderate')).toMatchObject({ n: 6, flareCount: 4 });
    expect(by('sweat:moderate').flareProb).toBeCloseTo(4 / 6, 12);
    expect(by('sweat:none').q1).toBeCloseTo(1.75, 12); // R-7 on [1,1,2,2,2,2,3,3]
    expect(by('sweat:none').q3).toBeCloseTo(2.25, 12);
  });

  it('computes the baseline over all days where the variable is known', () => {
    const r = forwardAnalysis(aligned, sweat);
    const all = aligned.map((a) => a.outcome);
    expect(r.baseline.n).toBe(28);
    expect(r.baseline.mean).toBeCloseTo(all.reduce((s, x) => s + x, 0) / 28, 12);
    expect(r.baseline.flareProb).toBeCloseTo(12 / 28, 12);
  });

  it('highlights levels that exceed the baseline mean (with a minimum-days guard)', () => {
    const r = forwardAnalysis(aligned, sweat, { minBucketDays: 5 });
    const exceeds = Object.fromEntries(r.levels.map((l) => [l.factorKey, l.exceedsBaseline]));
    expect(exceeds).toEqual({ 'sweat:none': false, 'sweat:light': false, 'sweat:moderate': true, 'sweat:heavy': true });
    // raising the guard above n removes the highlight
    const strict = forwardAnalysis(aligned, sweat, { minBucketDays: 7 });
    expect(strict.levels.find((l) => l.factorKey === 'sweat:moderate')?.exceedsBaseline).toBe(false);
  });

  it('attaches Wilson CIs, deltas, and significance (BH within the variable)', () => {
    const r = forwardAnalysis(aligned, sweat);
    const heavy = r.levels.find((l) => l.factorKey === 'sweat:heavy')!;
    expect(heavy.flareCI?.[0]).toBeGreaterThan(0.6);
    expect(heavy.flareCI?.[1]).toBeCloseTo(1, 10);
    expect(heavy.deltaMean).toBeCloseTo((65 / 8) - (r.baseline.mean as number), 12);
    expect(heavy.p).toBeLessThan(0.01);
    expect(heavy.q).toBeGreaterThanOrEqual(heavy.p as number);
    expect(r.levels.find((l) => l.factorKey === 'sweat:none')?.p).toBeGreaterThan(0.9);
  });

  it('reports a monotone trend for ordinal variables', () => {
    const r = forwardAnalysis(aligned, sweat);
    expect(r.trend?.rho).toBeGreaterThan(0.85);
    expect(r.trend?.p).toBeLessThan(0.001);
    expect(r.trend?.n).toBe(28);
  });

  it('keeps empty levels visible (n = 0, null stats) so charts show every bucket', () => {
    const r = forwardAnalysis(align([['none', [1, 2, 3, 4, 5]], ['heavy', [7, 8, 9, 7, 8]]]), sweat);
    const light = r.levels.find((l) => l.factorKey === 'sweat:light')!;
    expect(light).toMatchObject({ n: 0, mean: null, median: null, flareProb: null, flareCI: null, p: null, q: null, exceedsBaseline: false });
  });

  it('excludes days where the variable is unknown and warns about coverage', () => {
    const r = forwardAnalysis(align([['none', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]], [null, [9, 9, 9]]]), sweat);
    expect(r.baseline.n).toBe(10);
    expect(r.warnings).toContainEqual({ code: 'low_coverage', params: { known: 10, total: 13 } });
  });

  it('works for continuous variables via buckets and a Spearman trend', () => {
    const stress = findVariable(reg, 'stress');
    const days = Array.from({ length: 30 }, (_, i): AlignedDay => {
      const date = addDaysISO(d('2024-02-01'), i);
      const s = (i % 10) + 1;
      return { date, exposure: frame(date, { stress: s }), outcome: s };
    });
    const r = forwardAnalysis(days, stress);
    expect(r.levels.map((l) => [l.factorKey, l.n])).toEqual([['stress:stress_1_3', 9], ['stress:stress_4_6', 9], ['stress:stress_7_10', 12]]);
    expect(r.trend?.rho).toBeCloseTo(1, 10);
  });

  it('returns no_data for an empty input', () => {
    const r = forwardAnalysis([], sweat);
    expect(r.warnings).toEqual([{ code: 'no_data' }]);
    expect(r.baseline).toEqual({ n: 0, mean: null, median: null, flareProb: null });
  });
});

import { describe, expect, it } from 'vitest';
import { rankTriggerImpact, reverseAnalysis, scanFactors, tierPredicate } from './scan';
import { type AlignedDay, tierOf } from './types';
import { buildRegistry, compileAllFactors, factorsForVariable, findVariable } from './variables';
import { addDaysISO } from '@/lib/date';
import { d, frame } from '@/test/factories';
import type { SweatLevel } from '@/db/types';

const reg = buildRegistry();
const sweatFactors = factorsForVariable(findVariable(reg, 'sweat'));
const heavy = sweatFactors.filter((f) => f.key === 'sweat:heavy');

/** Build aligned days from [sweat, outcome, count] triples. */
function align(rows: [SweatLevel, number, number][]): AlignedDay[] {
  const out: AlignedDay[] = [];
  let i = 0;
  for (const [sweat, outcome, count] of rows) {
    for (let k = 0; k < count; k++) {
      const date = addDaysISO(d('2024-01-01'), i++);
      out.push({ date, exposure: frame(date, { sweat }), outcome });
    }
  }
  return out;
}

describe('tiers', () => {
  it('maps integer severities to the three tiers; 0 belongs to none', () => {
    expect([0, 1, 3, 4, 6, 7, 10].map(tierOf)).toEqual([null, 'mild', 'mild', 'moderate', 'moderate', 'severe', 'severe']);
  });
});

describe('scanFactors — hand-computed 2x2 (heavy sweat vs severe tier)', () => {
  //            severe   not
  // heavy        6        2      m = 8
  // not heavy    2       10
  const aligned = align([['heavy', 8, 6], ['heavy', 2, 2], ['none', 8, 2], ['none', 2, 10]]);

  it('computes coOccurrence, baseline, lift, phi, relative risk and the exact Fisher p', () => {
    const [r] = scanFactors(aligned, heavy, tierPredicate('severe'), { minTierDays: 5, minFactorSupport: 3 });
    expect(r).toBeDefined();
    expect(r?.counts).toEqual({ N: 20, targetDays: 8, factorDays: 8, both: 6 });
    expect(r?.coOccurrenceRate).toBeCloseTo(0.75, 12);
    expect(r?.baselineRate).toBeCloseTo(0.4, 12);
    expect(r?.lift).toBeCloseTo(1.875, 12);
    expect(r?.phi).toBeCloseTo(56 / 96, 12);
    expect(r?.relativeRisk).toBeCloseTo(4.5, 12); // (6/8) / (2/12)
    // P(X>=6), X~Hyper(20, 8, 8) = (28*66 + 8*12 + 1) / C(20,8) = 1945 / 125970
    expect(r?.pValue).toBeCloseTo(1945 / 125970, 10);
    expect(r?.direction).toBe('risk');
  });

  it('reproduces the spec example: present on 75% of severe days vs 22% of all days = 3.41x', () => {
    // N=100: 22 present (6 severe), 78 absent (2 severe)
    const big = align([['heavy', 8, 6], ['heavy', 2, 16], ['none', 8, 2], ['none', 2, 76]]);
    const [r] = scanFactors(big, heavy, tierPredicate('severe'));
    expect(r?.coOccurrenceRate).toBeCloseTo(0.75, 12);
    expect(r?.baselineRate).toBeCloseTo(0.22, 12);
    expect(r?.lift).toBeCloseTo(3.4090909, 6);
    expect(r?.lift.toFixed(2)).toBe('3.41');
  });

  it('flags factors with too little support as insufficient (and gives them no q-value)', () => {
    const rare = align([['heavy', 8, 2], ['none', 8, 6], ['none', 2, 12]]);
    const [r] = scanFactors(rare, heavy, tierPredicate('severe'), { minFactorSupport: 3 });
    expect(r?.evidence).toBe('insufficient');
    expect(r?.qValue).toBeNull();
  });

  it('flags everything insufficient when the target tier has too few days', () => {
    const [r] = scanFactors(align([['heavy', 8, 2], ['heavy', 2, 5], ['none', 2, 13]]), heavy, tierPredicate('severe'), { minTierDays: 5 });
    expect(r?.evidence).toBe('insufficient');
  });

  it('omits a factor that is never present, and handles an empty dataset', () => {
    expect(scanFactors(align([['none', 2, 10]]), heavy, tierPredicate('severe'))).toEqual([]);
    expect(scanFactors([], heavy, tierPredicate('severe'))).toEqual([]);
  });

  it('classifies direction: lift < 1 is protective', () => {
    const prot = align([['heavy', 2, 8], ['none', 8, 6], ['none', 2, 6]]);
    const [r] = scanFactors(prot, heavy, tierPredicate('severe'), { minTierDays: 1 });
    expect(r?.lift).toBe(0);
    expect(r?.direction).toBe('protective');
  });

  it('uses a per-factor denominator: unknown exposures are excluded, not counted as absent', () => {
    const unknown: AlignedDay[] = Array.from({ length: 10 }, (_, i) => {
      const date = addDaysISO(d('2024-03-01'), i);
      return { date, exposure: frame(date, { sweat: null }), outcome: 8 };
    });
    const [r] = scanFactors([...align([['heavy', 8, 6], ['heavy', 2, 2], ['none', 8, 2], ['none', 2, 10]]), ...unknown], heavy, tierPredicate('severe'));
    expect(r?.counts.N).toBe(20); // the 10 unknown days do not enter the table
  });
});

describe('ranking and multiple-comparison control', () => {
  // 40 days with a strong real signal (heavy sweat) among many other factors that are noise.
  const mk = () => {
    const out: AlignedDay[] = [];
    for (let i = 0; i < 60; i++) {
      const date = addDaysISO(d('2024-01-01'), i);
      const heavyDay = i % 6 === 0;
      const outcome = heavyDay ? 8 : i % 7 === 3 ? 8 : 2;
      out.push({ date, exposure: frame(date, { sweat: heavyDay ? 'heavy' : 'light', beddingDays: i % 20, stress: (i * 7) % 10 + 1, diet: i % 3 === 0 ? ['eggs'] : [] }), outcome });
    }
    return out;
  };

  it('ranks the real signal first and splits ranked / protective / insufficient', () => {
    const res = reverseAnalysis(mk(), compileAllFactors(reg), 'severe', { lag: 'T0' });
    expect(res.ranked[0]?.factorKey).toBe('sweat:heavy');
    expect(res.ranked[0]?.evidence).toBe('strong');
    expect(res.ranked.every((f) => f.lift > 1 && f.evidence !== 'insufficient')).toBe(true);
    expect(res.protective.every((f) => f.lift <= 1)).toBe(true);
    expect(res.insufficient.every((f) => f.evidence === 'insufficient')).toBe(true);
    // sorted by lift desc
    const lifts = res.ranked.map((f) => f.lift);
    expect([...lifts].sort((a, b) => b - a)).toEqual(lifts);
    expect(res.N).toBe(60);
    expect(res.target).toEqual({ kind: 'tier', tier: 'severe' });
  });

  it('BH q-values are never smaller than raw p-values', () => {
    const res = reverseAnalysis(mk(), compileAllFactors(reg), 'severe');
    for (const f of [...res.ranked, ...res.protective]) expect(f.qValue as number).toBeGreaterThanOrEqual(f.pValue - 1e-12);
  });

  it('is deterministic (same input -> identical output, stable tie-break)', () => {
    const a = reverseAnalysis(mk(), compileAllFactors(reg), 'severe');
    const b = reverseAnalysis(mk(), compileAllFactors(reg), 'severe');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('rankTriggerImpact targets flares (severity >= 6)', () => {
    const res = rankTriggerImpact(mk(), compileAllFactors(reg));
    expect(res.target).toEqual({ kind: 'flare' });
    expect(res.targetDays).toBe(mk().filter((x) => x.outcome >= 6).length);
    expect(res.ranked[0]?.factorKey).toBe('sweat:heavy');
  });

  it('warns on small samples, few tier days and empty data using structured codes (no text)', () => {
    const small = reverseAnalysis(align([['heavy', 8, 2], ['none', 2, 8]]), heavy, 'severe');
    expect(small.warnings.map((w) => w.code).sort()).toEqual(['few_tier_days', 'small_sample']);
    expect(reverseAnalysis([], heavy, 'severe').warnings).toEqual([{ code: 'no_data' }]);
  });
});

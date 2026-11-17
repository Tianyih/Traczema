import { describe, expect, it } from 'vitest';
import { buildRegistry, compileAllFactors, factorsForVariable, findVariable, numericValue, DEFAULT_COMPOSITES } from './variables';
import { d, frame } from '@/test/factories';

const reg = buildRegistry();
const ev = (key: string, f: ReturnType<typeof frame>) => compileAllFactors(reg).find((x) => x.key === key)?.evaluate(f);
const bucketOf = (variableId: Parameters<typeof findVariable>[1], f: ReturnType<typeof frame>): string[] =>
  factorsForVariable(findVariable(reg, variableId)).filter((x) => x.evaluate(f) === 1).map((x) => x.key);

describe('bucket boundaries are half-open [min, max)', () => {
  it('bedding days: 0-3 / 4-7 / 8-10 / 11-14 / >14', () => {
    const at = (n: number) => bucketOf('bedding_days', frame(d('2024-01-01'), { beddingDays: n }));
    expect(at(0)).toEqual(['bedding_days:bedding_0_3']);
    expect(at(3)).toEqual(['bedding_days:bedding_0_3']);
    expect(at(4)).toEqual(['bedding_days:bedding_4_7']);
    expect(at(10)).toEqual(['bedding_days:bedding_8_10']);
    expect(at(11)).toEqual(['bedding_days:bedding_11_14']);
    expect(at(14)).toEqual(['bedding_days:bedding_11_14']);
    expect(at(15)).toEqual(['bedding_days:bedding_gt14']);
    expect(at(60)).toEqual(['bedding_days:bedding_gt14']);
  });

  it('temperature: exactly on an edge belongs to the upper bucket; open ends are unbounded', () => {
    const at = (t: number) => bucketOf('temperature', frame(d('2024-01-01'), { tempC: t }));
    expect(at(-20)).toEqual(['temperature:temp_lt10']);
    expect(at(9.9)).toEqual(['temperature:temp_lt10']);
    expect(at(10)).toEqual(['temperature:temp_10_19']);
    expect(at(19.99)).toEqual(['temperature:temp_10_19']);
    expect(at(20)).toEqual(['temperature:temp_20_25']);
    expect(at(31)).toEqual(['temperature:temp_gt30']);
  });

  it('every VALID value falls into exactly one bucket of every continuous variable', () => {
    // Valid domains mirror validateDailyLog (stress 1–10, sleep quality 1–5, the rest >= 0).
    const wide = [0, 0.5, 1, 2, 3, 3.5, 4, 5, 6, 7, 8, 10, 11, 15, 16, 30, 31, 60, 61, 100];
    const cases: [string, (n: number) => ReturnType<typeof frame>, number[]][] = [
      ['temperature', (n) => frame(d('2024-01-01'), { tempC: n }), [-40, ...wide, 55]],
      ['humidity', (n) => frame(d('2024-01-01'), { humidityPct: n }), [0, 29.9, 30, 49.9, 50, 69.9, 70, 100]],
      ['stress', (n) => frame(d('2024-01-01'), { stress: n }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
      ['sleep_hours', (n) => frame(d('2024-01-01'), { sleepHours: n }), [0, 5.5, 6, 7.5, 8, 12, 24]],
      ['sleep_quality', (n) => frame(d('2024-01-01'), { sleepQuality: n }), [1, 2, 3, 4, 5]],
      ['exercise_minutes', (n) => frame(d('2024-01-01'), { exerciseMin: n }), wide],
      ['shower_minutes', (n) => frame(d('2024-01-01'), { showerMin: n }), wide],
      ['bedding_days', (n) => frame(d('2024-01-01'), { beddingDays: n }), wide],
    ];
    for (const [id, make, values] of cases) {
      for (const n of values) expect(bucketOf(id as never, make(n)), `${id}=${n}`).toHaveLength(1);
    }
  });
});

describe('unknown is not absent', () => {
  it('evaluates to null (excluded) when the underlying value is unrecorded', () => {
    const f = frame(d('2024-01-01'));
    expect(ev('bedding_days:bedding_0_3', f)).toBeNull();
    expect(ev('sweat:heavy', f)).toBeNull();
    expect(ev('diet:dairy', f)).toBeNull();
    expect(ev('moisturizer:yes', f)).toBeNull();
  });

  it('diet: [] means explicitly none (0), a tag list means present/absent', () => {
    expect(ev('diet:dairy', frame(d('2024-01-01'), { diet: [] }))).toBe(0);
    expect(ev('diet:dairy', frame(d('2024-01-01'), { diet: ['dairy', 'eggs'] }))).toBe(1);
    expect(ev('diet:soy', frame(d('2024-01-01'), { diet: ['dairy'] }))).toBe(0);
  });

  it('shower temperature distinguishes "no shower" from unrecorded', () => {
    expect(ev('shower_temp:no_shower', frame(d('2024-01-01'), { shower: 'no_shower' }))).toBe(1);
    expect(ev('shower_temp:hot', frame(d('2024-01-01'), { shower: 'no_shower' }))).toBe(0);
    expect(ev('shower_temp:hot', frame(d('2024-01-01'), { shower: null }))).toBeNull();
  });
});

describe('composites use Kleene three-valued logic', () => {
  const comp = (id: string, f: ReturnType<typeof frame>) => ev(`composite:${id}`, f);
  it('AND: false beats unknown, unknown otherwise propagates', () => {
    const id = 'sweat_heavy_and_shower_hot';
    expect(comp(id, frame(d('2024-01-01'), { sweat: 'heavy', shower: 'hot' }))).toBe(1);
    expect(comp(id, frame(d('2024-01-01'), { sweat: 'heavy', shower: 'warm' }))).toBe(0);
    expect(comp(id, frame(d('2024-01-01'), { sweat: 'light', shower: null }))).toBe(0); // one part is definitely false
    expect(comp(id, frame(d('2024-01-01'), { sweat: 'heavy', shower: null }))).toBeNull();
  });
  it('OR: bedding unwashed > 10 days = (11-14) or (>14)', () => {
    expect(comp('bedding_gt10', frame(d('2024-01-01'), { beddingDays: 10 }))).toBe(0);
    expect(comp('bedding_gt10', frame(d('2024-01-01'), { beddingDays: 11 }))).toBe(1);
    expect(comp('bedding_gt10', frame(d('2024-01-01'), { beddingDays: 40 }))).toBe(1);
    expect(comp('bedding_gt10', frame(d('2024-01-01'), { beddingDays: null }))).toBeNull();
  });
  it('rejects composites that reference unknown factors', () => {
    expect(() => compileAllFactors(reg, [{ id: 'x', labelKey: 'x', op: 'and', parts: ['nope:nope'] }])).toThrow(/unknown factor/);
    expect(DEFAULT_COMPOSITES.length).toBeGreaterThan(0);
  });
});

describe('registry', () => {
  it('includes custom tags supplied by the user as factors with a custom value', () => {
    const r = buildRegistry({ customDietTags: ['custom:abc'], customActivities: ['custom:xyz'] });
    const diet = factorsForVariable(findVariable(r, 'diet')).find((f) => f.key === 'diet:custom:abc');
    expect(diet?.value).toEqual({ kind: 'custom', ref: 'custom:abc' });
    expect(diet?.evaluate(frame(d('2024-01-01'), { diet: ['custom:abc'] }))).toBe(1);
  });
  it('numericValue: raw for continuous, category rank for ordinal, undefined for unordered', () => {
    expect(numericValue(findVariable(reg, 'stress'), frame(d('2024-01-01'), { stress: 8 }))).toBe(8);
    expect(numericValue(findVariable(reg, 'sweat'), frame(d('2024-01-01'), { sweat: 'heavy' }))).toBe(3);
    expect(numericValue(findVariable(reg, 'diet'), frame(d('2024-01-01'), { diet: [] }))).toBeNull();
  });
  it('factor keys are unique and every variable has at least two levels', () => {
    const all = compileAllFactors(reg);
    expect(new Set(all.map((f) => f.key)).size).toBe(all.length);
    for (const v of reg) expect(factorsForVariable(v).length).toBeGreaterThanOrEqual(2);
  });
});

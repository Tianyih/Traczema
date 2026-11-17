import { afterAll, describe, expect, it } from 'vitest';
import { REGION_IDS } from '@/db/types';
import { validateBodyPartLog, validateDailyLog } from '@/db/validate';
import { en } from '@/i18n/en';
import { fnv1a } from './prng';
import { DEFAULT_MOCK_SEED, EFFECTS, generateMockData, MOCK_GROUND_TRUTH } from './mockData';
import { buildFrames } from './derive/frames';
import { deriveAllRegionSummaries } from './derive/regionTimeline';
import {
  alignFrames,
  buildRegistry,
  compileAllFactors,
  findVariable,
  forwardAnalysis,
  rankTriggerImpact,
  reverseAnalysis,
  type FactorResult,
  type LagId,
} from './analytics';
import { d } from '@/test/factories';

const END = d('2024-06-30');
const registry = buildRegistry();
const factors = compileAllFactors(registry);

const framesOf = (seed: number, endDate = END) => {
  const ds = generateMockData({ seed, endDate });
  return { ds, frames: buildFrames({ dailyLogs: ds.dailyLogs, bodyPartLogs: ds.bodyPartLogs, from: ds.startDate, to: ds.endDate }) };
};
const rank = (frames: ReturnType<typeof framesOf>['frames'], lag: LagId) => rankTriggerImpact(alignFrames(frames, { lag }), factors, { lag });
const find = (r: ReturnType<typeof rank>, key: string): FactorResult | undefined =>
  [...r.ranked, ...r.protective, ...r.insufficient].find((f) => f.factorKey === key);

const originalTZ = process.env.TZ;
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

describe('determinism', () => {
  it('same seed + end date -> identical dataset; different seed -> different', () => {
    const a = generateMockData({ endDate: END });
    const b = generateMockData({ endDate: END });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(generateMockData({ endDate: END, seed: 7 }))).not.toBe(JSON.stringify(a));
    expect(a.seed).toBe(DEFAULT_MOCK_SEED);
  });

  it('is independent of the machine time zone', () => {
    const hashes = ['UTC', 'America/Los_Angeles', 'Asia/Shanghai', 'Australia/Sydney'].map((tz) => {
      process.env.TZ = tz;
      return fnv1a(JSON.stringify(generateMockData({ endDate: END })));
    });
    expect(new Set(hashes).size).toBe(1);
  });

  it('golden checksum: any change to the generator is a deliberate, reviewed change', () => {
    // If you intentionally change mockData.ts, update this value (and re-check the recovery tests below).
    expect(fnv1a(JSON.stringify(generateMockData({ endDate: END })))).toBe('7917bbc2');
  });
});

describe('language-agnostic output', () => {
  it('contains only ASCII canonical keys / numbers: no display text, no translated labels', () => {
    const json = JSON.stringify(generateMockData({ endDate: END }));
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(json)).toBe(false);
  });

  it('references i18n keys (notes / captions) that exist in the message files', () => {
    const ds = generateMockData({ endDate: END });
    const keys = [...Object.values(ds.noteKeys), ...ds.photos.map((p) => p.captionKey)];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(Object.prototype.hasOwnProperty.call(en, k as string), k).toBe(true);
  });
});

describe('structure of the 60-day dataset', () => {
  const { ds, frames } = framesOf(DEFAULT_MOCK_SEED);

  it('spans exactly 60 calendar days ending on the requested date', () => {
    expect(ds.startDate).toBe('2024-05-02');
    expect(ds.endDate).toBe('2024-06-30');
    expect(frames).toHaveLength(60);
  });

  it('has a few unlogged days and varied, realistic severities', () => {
    expect(ds.dailyLogs.length).toBeGreaterThanOrEqual(52);
    expect(ds.dailyLogs.length).toBeLessThanOrEqual(58);
    const sev = ds.dailyLogs.map((l) => l.overallSeverity as number);
    expect(Math.min(...sev)).toBeLessThanOrEqual(1);
    expect(Math.max(...sev)).toBeGreaterThanOrEqual(8);
    const flares = sev.filter((s) => s >= 6).length;
    expect(flares / sev.length).toBeGreaterThan(0.1);
    expect(flares / sev.length).toBeLessThan(0.45);
  });

  it('every row satisfies the same validation the app applies to user input', () => {
    for (const l of ds.dailyLogs) expect(() => validateDailyLog(l)).not.toThrow();
    for (const b of ds.bodyPartLogs) expect(() => validateBodyPartLog(b)).not.toThrow();
  });

  it('has unique (region, date) body logs and one daily log per date', () => {
    expect(new Set(ds.bodyPartLogs.map((b) => `${b.regionId}|${b.date}`)).size).toBe(ds.bodyPartLogs.length);
    expect(new Set(ds.dailyLogs.map((l) => l.date)).size).toBe(ds.dailyLogs.length);
  });

  it('plants the bedding pattern: irregular washes with gaps > 10 days (~20–35% of days)', () => {
    const washes = ds.dailyLogs.filter((l) => l.bedding?.washedToday).map((l) => l.date);
    expect(washes.length).toBeGreaterThanOrEqual(3);
    const over10 = frames.filter((f) => (f.beddingDays ?? 0) > 10).length;
    expect(over10).toBeGreaterThanOrEqual(12);
    expect(over10).toBeLessThanOrEqual(20);
    expect(ds.dailyLogs[0]?.bedding?.assumedLastWashDate).toBe('2024-04-26'); // manual anchor on the first day
    expect(frames[0]?.beddingDays).toBe(6);
  });

  it('plants enough heavy-sweat + hot-shower days to analyse', () => {
    const combos = frames.filter((f) => f.sweat === 'heavy' && f.shower === 'hot').length;
    expect(combos).toBeGreaterThanOrEqual(6);
    expect(combos).toBeLessThanOrEqual(12);
  });

  it('produces an anatomically interesting body map', () => {
    const s = deriveAllRegionSummaries(ds.bodyPartLogs, ds.endDate);
    expect(s.neck.recurrenceCount).toBeGreaterThanOrEqual(1);
    expect(s.antecubital_fossa.recurrenceCount).toBeGreaterThanOrEqual(1);
    expect(s.face.recurrenceCount).toBe(1);
    expect(s.face.avgRemissionDays).toBeGreaterThan(10);
    expect(s.hands_wrists.currentStatus).toBe('active');
    expect(s.hands_wrists.currentEpisode).not.toBeNull();
    expect(s.popliteal_fossa.residualSkinNow).toEqual([]); // cleared later
    expect(s.popliteal_fossa.episodes[0]?.residualSkin).toEqual(['lichenification']);
    expect(s.antecubital_fossa.episodes[0]?.residualSkin).toEqual(['hyperpigmentation']);
    expect(s.forearms.residualSkinNow).toEqual(['xerosis']);
    expect(s.scalp.currentStatus).toBe('clear');
    expect(s.groin.episodeCount).toBe(0);
    // statuses used by the calendar badge: at least some flare activity per week on average
    expect(frames.filter((f) => f.activeRegionCount > 0).length).toBeGreaterThan(15);
  });

  it('plants photos on flare / healing / healed milestones and on bad days', () => {
    expect(ds.photos.length).toBeGreaterThanOrEqual(8);
    expect(ds.photos.some((p) => p.regionId === null)).toBe(true);
    expect(ds.photos.some((p) => p.regionId === 'neck')).toBe(true);
  });

  it('neck / flexural flares ERUPT while bedding is overdue (the planted regional effect)', () => {
    const summaries = deriveAllRegionSummaries(ds.bodyPartLogs, ds.endDate);
    const beddingOn = new Map(frames.map((f) => [f.date, f.beddingDays ?? 0]));
    const bedsensitive = ['neck', 'antecubital_fossa', 'popliteal_fossa', 'forearms'] as const;
    const onsets = bedsensitive.flatMap((r) => summaries[r].episodes.map((e) => ({ r, start: e.startDate })));
    expect(onsets.length).toBeGreaterThanOrEqual(5);
    for (const o of onsets) expect(beddingOn.get(o.start), `${o.r} onset ${o.start}`).toBeGreaterThan(10);
  });

  it('region-filtered Reverse Explorer: neck + Severe flare points at overdue bedding', () => {
    const al = alignFrames(frames, { lag: 'T0', regionId: 'neck' });
    const res = reverseAnalysis(al, factors, 'severe', { lag: 'T0', regionId: 'neck', minTierDays: 3 });
    const bedding = find(res, 'composite:bedding_gt10');
    expect(res.regionId).toBe('neck');
    expect(res.targetDays).toBeGreaterThanOrEqual(5);
    expect(bedding?.direction).toBe('risk');
    expect(bedding?.lift).toBeGreaterThan(2.5);
    expect(bedding?.pValue).toBeLessThan(0.05);
    expect(res.ranked.slice(0, 3).map((x) => x.factorKey)).toContain('composite:bedding_gt10');
  });
});

describe('analytics engine recovers the planted correlations (default seed)', () => {
  const { frames } = framesOf(DEFAULT_MOCK_SEED);

  it('PRIMARY: heavy sweat + hot shower -> flare 24h later (T+1)', () => {
    const f = find(rank(frames, 'T1'), 'composite:sweat_heavy_and_shower_hot');
    expect(f?.direction).toBe('risk');
    expect(['strong', 'moderate']).toContain(f?.evidence);
    expect(f?.lift).toBeGreaterThan(2);
    // ...and it is a TOP finding at that lag
    const top = rank(frames, 'T1').ranked.slice(0, 5).map((x) => x.factorKey);
    expect(top).toContain('composite:sweat_heavy_and_shower_hot');
  });

  it('PRIMARY: bedding unwashed > 10 days -> flare same day (T+0)', () => {
    const f = find(rank(frames, 'T0'), 'composite:bedding_gt10');
    expect(f?.direction).toBe('risk');
    expect(['strong', 'moderate']).toContain(f?.evidence);
    expect(f?.lift).toBeGreaterThan(2);
    expect(rank(frames, 'T0').ranked.slice(0, 5).map((x) => x.factorKey)).toContain('composite:bedding_gt10');
  });

  it('the lag selector matters: the sweat+shower effect is strongest at T+1, not T+0', () => {
    const at = (lag: LagId) => find(rank(frames, lag), 'composite:sweat_heavy_and_shower_hot')?.lift ?? 0;
    expect(at('T1')).toBeGreaterThan(at('T0'));
  });

  it('SECONDARY (Forward Explorer): dairy raises severity two days later', () => {
    const r = forwardAnalysis(alignFrames(frames, { lag: 'T2' }), findVariable(registry, 'diet'), { lag: 'T2' });
    expect(r.levels.find((l) => l.factorKey === 'diet:dairy')?.deltaMean).toBeGreaterThan(0.5);
  });

  it('SECONDARY (Forward Explorer): high stress, low humidity up; moisturiser down', () => {
    const delta = (variable: Parameters<typeof findVariable>[1], key: string) =>
      forwardAnalysis(alignFrames(frames, { lag: 'T0' }), findVariable(registry, variable)).levels.find((l) => l.factorKey === key)?.deltaMean ?? 0;
    expect(delta('stress', 'stress:stress_7_10')).toBeGreaterThan(0.5);
    expect(delta('humidity', 'humidity:hum_lt30')).toBeGreaterThan(0.5);
    expect(delta('moisturizer', 'moisturizer:yes')).toBeLessThan(0);
    const stress = forwardAnalysis(alignFrames(frames, { lag: 'T0' }), findVariable(registry, 'stress'));
    expect(stress.trend?.rho).toBeGreaterThan(0);
  });

  it('forward explorer on bedding shows a clear dose-response, highlighting the long-unwashed buckets', () => {
    const r = forwardAnalysis(alignFrames(frames, { lag: 'T0' }), findVariable(registry, 'bedding_days'));
    const mean = (k: string) => r.levels.find((l) => l.factorKey === `bedding_days:${k}`)?.mean ?? 0;
    expect(mean('bedding_11_14')).toBeGreaterThan(mean('bedding_0_3') + 2);
    expect(r.levels.find((l) => l.factorKey === 'bedding_days:bedding_11_14')?.exceedsBaseline).toBe(true);
    expect(r.levels.find((l) => l.factorKey === 'bedding_days:bedding_0_3')?.exceedsBaseline).toBe(false);
    expect(r.trend?.rho).toBeGreaterThan(0.3);
  });

  it('NULL CONTROLS (silk, wool, soy) are not reported as strong triggers', () => {
    for (const lag of ['T0', 'T1', 'T2'] as LagId[]) {
      const r = rank(frames, lag);
      for (const g of MOCK_GROUND_TRUTH.filter((x) => x.kind === 'null')) {
        expect(find(r, g.factorKey)?.evidence, `${g.factorKey}@${lag}`).not.toBe('strong');
      }
    }
  });
});

describe('recovery is robust, not tuned to one seed (40 seeds)', () => {
  // Deterministic (fixed seeds), so this is stable. Thresholds sit below the measured rates.
  const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
  const results = SEEDS.map((seed) => {
    const { frames } = framesOf(seed);
    const t0 = rank(frames, 'T0');
    const t1 = rank(frames, 'T1');
    const ok = (f?: FactorResult) => !!f && f.direction === 'risk' && (f.evidence === 'strong' || f.evidence === 'moderate');
    const fwd = (lag: LagId, v: Parameters<typeof findVariable>[1], key: string) =>
      forwardAnalysis(alignFrames(frames, { lag }), findVariable(registry, v)).levels.find((l) => l.factorKey === key)?.deltaMean ?? 0;
    const spurious = (['T0', 'T1', 'T2'] as LagId[]).flatMap((lag) => rank(frames, lag).ranked)
      .filter((f) => f.evidence === 'strong')
      .filter((f) => !/^(composite|sweat|shower_temp|exercise_minutes|activity|bedding_days|stress|humidity|diet:dairy|moisturizer):?/.test(f.factorKey)).length;
    return {
      sweatShower: ok(find(t1, 'composite:sweat_heavy_and_shower_hot')),
      bedding: ok(find(t0, 'composite:bedding_gt10')),
      dairy: fwd('T2', 'diet', 'diet:dairy') > 0.5,
      stress: fwd('T0', 'stress', 'stress:stress_7_10') > 0.5,
      humidity: fwd('T0', 'humidity', 'humidity:hum_lt30') > 0.5,
      moisturizer: fwd('T0', 'moisturizer', 'moisturizer:yes') < 0,
      neckBedding: (() => {
        const al = alignFrames(frames, { lag: 'T0', regionId: 'neck' });
        const res = reverseAnalysis(al, factors, 'severe', { lag: 'T0', regionId: 'neck', minTierDays: 3 });
        const f = [...res.ranked, ...res.protective, ...res.insufficient].find((x) => x.factorKey === 'composite:bedding_gt10');
        return !!f && f.direction === 'risk' && f.lift > 2;
      })(),
      nullStrong: ['clothing:silk', 'clothing:wool', 'diet:soy'].some((k) => find(t0, k)?.evidence === 'strong'),
      spurious,
    };
  });
  const rate = (pick: (r: (typeof results)[number]) => boolean) => results.filter(pick).length / results.length;

  it('primary planted effects are recovered in >= 85% of seeds', () => {
    expect(rate((r) => r.sweatShower)).toBeGreaterThanOrEqual(0.85);
    expect(rate((r) => r.bedding)).toBeGreaterThanOrEqual(0.85);
  });
  it('the regional planted effect (neck + Severe -> overdue bedding) holds in >= 85% of seeds', () => {
    expect(rate((r) => r.neckBedding)).toBeGreaterThanOrEqual(0.85);
  });
  it('secondary effects point the right way in most seeds', () => {
    expect(rate((r) => r.dairy)).toBeGreaterThanOrEqual(0.9);
    expect(rate((r) => r.stress)).toBeGreaterThanOrEqual(0.7);
    expect(rate((r) => r.humidity)).toBeGreaterThanOrEqual(0.7);
    expect(rate((r) => r.moisturizer)).toBeGreaterThanOrEqual(0.75);
  });
  it('null controls are never reported as strong; unexplained "strong" findings stay rare (FDR-like)', () => {
    expect(rate((r) => r.nullStrong)).toBe(0);
    const meanSpurious = results.reduce((s, r) => s + r.spurious, 0) / (results.length * 3);
    expect(meanSpurious).toBeLessThanOrEqual(0.1);
  });
});

describe('knobs', () => {
  it('exposes the planted effect sizes in one place', () => {
    expect(EFFECTS.heavyAndHotPrev).toBeGreaterThan(EFFECTS.heavySweatPrev);
    expect(REGION_IDS.length).toBe(15);
  });
  it('honours a custom length', () => {
    expect(generateMockData({ endDate: END, days: 30 }).dailyLogs.length).toBeLessThanOrEqual(30);
    expect(generateMockData({ endDate: END, days: 30 }).startDate).toBe('2024-06-01');
  });
});

import { describe, expect, it } from 'vitest';
import {
  boxGeometry, DEFAULT_PARAMS, forwardRows, headline, parseAnalyticsParams, rangeStart, scale01, sliceFrames, toSearchParams, VARIABLE_IDS,
} from './view';
import { buildRegistry } from './variables';
import { forwardAnalysis } from './forward';
import type { AlignedDay } from './types';
import { addDaysISO } from '@/lib/date';
import { d, frame } from '@/test/factories';

const sp = (q: string) => new URLSearchParams(q);

describe('URL state', () => {
  it('defaults on an empty query', () => {
    expect(parseAnalyticsParams(sp(''))).toEqual(DEFAULT_PARAMS);
  });
  it('reads every field', () => {
    expect(parseAnalyticsParams(sp('tab=reverse&lag=W48&range=30&var=sweat&tier=mild&region=neck&onset=1'))).toEqual({
      tab: 'reverse', lag: 'W48', range: '30', variable: 'sweat', tier: 'mild', region: 'neck', onset: true,
    });
  });
  it('rejects every invalid value individually and falls back (a stale or hand-edited URL cannot break the page)', () => {
    const p = parseAnalyticsParams(sp('tab=hack&lag=T9&range=7&var=__proto__&tier=extreme&region=nose&onset=yes'));
    expect(p).toEqual(DEFAULT_PARAMS);
    expect(parseAnalyticsParams(sp('lag=T1&tab=nope')).lag).toBe('T1'); // one bad field does not discard the others
  });
  it('round-trips, writing only non-default values', () => {
    expect(toSearchParams(DEFAULT_PARAMS)).toEqual({});
    const p = { tab: 'forward', lag: 'T2', range: '90', variable: 'diet', tier: 'moderate', region: 'face', onset: true } as const;
    expect(toSearchParams(p)).toEqual({ tab: 'forward', lag: 'T2', range: '90', var: 'diet', tier: 'moderate', region: 'face', onset: '1' });
    expect(parseAnalyticsParams(new URLSearchParams(toSearchParams(p)))).toEqual(p);
  });
  it('every selectable variable exists in the registry (no dead options)', () => {
    const ids = buildRegistry().map((v) => v.id).sort();
    expect([...VARIABLE_IDS].sort()).toEqual(ids);
  });
});

describe('range', () => {
  it('"last N days" includes today and the N-1 days before it; "all" is unbounded', () => {
    expect(rangeStart('30', d('2024-06-30'))).toBe('2024-06-01');
    expect(rangeStart('90', d('2024-06-30'))).toBe('2024-04-02');
    expect(rangeStart('all', d('2024-06-30'))).toBeNull();
  });
  it('slices frames by first day', () => {
    const frames = Array.from({ length: 5 }, (_, i) => frame(addDaysISO(d('2024-06-01'), i)));
    expect(sliceFrames(frames, d('2024-06-03')).map((f) => f.date)).toEqual(['2024-06-03', '2024-06-04', '2024-06-05']);
    expect(sliceFrames(frames, null)).toHaveLength(5);
  });
});

describe('headline', () => {
  it('counts only days with a severity (unrated != 0), and flare = severity >= 6', () => {
    const frames = [2, 6, 8, null, 4].map((s, i) => frame(addDaysISO(d('2024-06-01'), i), { severity: s }));
    const h = headline(frames);
    expect(h).toEqual({ loggedDays: 4, mean: 5, flareDays: 2, flareRate: 0.5 });
    expect(headline([])).toEqual({ loggedDays: 0, mean: null, flareDays: 0, flareRate: null });
  });
});

describe('forwardRows', () => {
  const reg = buildRegistry();
  const sweat = reg.find((v) => v.id === 'sweat')!;
  const days = (rows: [string, number[]][]): AlignedDay[] => {
    let i = 0;
    return rows.flatMap(([s, outs]) => outs.map((outcome) => {
      const date = addDaysISO(d('2024-01-01'), i++);
      return { date, outcome, exposure: frame(date, { sweat: s as never }) };
    }));
  };
  const r = forwardAnalysis(days([['none', [1, 2, 2, 3, 2, 1]], ['moderate', [5, 6, 7, 5, 6, 6]], ['heavy', [8, 9, 3]]]), sweat);

  it('marks mean-above-baseline and flare-above-baseline separately, only with enough days', () => {
    const rows = Object.fromEntries(forwardRows(r, 5).map((x) => [x.factorKey, x]));
    expect(rows['sweat:none']).toMatchObject({ exceedsMean: false, exceedsFlare: false });
    expect(rows['sweat:moderate']).toMatchObject({ exceedsMean: true, exceedsFlare: true });
    expect(rows['sweat:heavy']).toMatchObject({ n: 3, exceedsMean: false, exceedsFlare: false }); // n < 5: not highlighted
    expect(rows['sweat:light']).toMatchObject({ n: 0, mean: null, exceedsMean: false });
  });
  it('a stricter minimum removes the highlight', () => {
    expect(forwardRows(r, 7).find((x) => x.factorKey === 'sweat:moderate')?.exceedsFlare).toBe(false);
  });
});

describe('spread glyph geometry', () => {
  const lvl = { n: 5, min: 1, q1: 2, median: 5, q3: 8, max: 10 };
  it('maps min / Q1 / median / Q3 / max proportionally onto the width', () => {
    expect(boxGeometry(lvl, [0, 10], 100)).toEqual({ min: 10, q1: 20, median: 50, q3: 80, max: 100 });
    expect(boxGeometry(lvl, [0, 10], 50)?.median).toBe(25);
  });
  it('clamps out-of-domain values and is null for empty levels', () => {
    expect(boxGeometry({ ...lvl, max: 14 }, [0, 10], 100)?.max).toBe(100);
    expect(boxGeometry({ n: 0, min: null, q1: null, median: null, q3: null, max: null }, [0, 10], 100)).toBeNull();
  });
  it('scale01 clamps', () => {
    expect([scale01(5, 10), scale01(-1, 10), scale01(20, 10), scale01(1, 0)]).toEqual([0.5, 0, 1, 0]);
  });
});

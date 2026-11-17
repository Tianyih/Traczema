import { describe, expect, it } from 'vitest';
import { buildTimeSeries } from './timeseries';
import { addDaysISO } from '@/lib/date';
import { d, frame } from '@/test/factories';

describe('buildTimeSeries', () => {
  const frames = [0, 1, 2, 3].map((i) =>
    frame(addDaysISO(d('2024-01-01'), i), {
      severity: i === 2 ? null : i + 2,
      tempC: [10, 20, null, 30][i] ?? null,
      beddingDays: [0, 1, 2, 3][i] ?? null,
      beddingWashedToday: i === 0,
    }),
  );

  it('keeps unknown severity as null (a gap in the chart, not a zero)', () => {
    const s = buildTimeSeries(frames, ['temperature']);
    expect(s.map((p) => p.severity)).toEqual([2, 3, null, 5]);
  });

  it('min-max scales each requested track to [0, 1] and keeps raw values', () => {
    const s = buildTimeSeries(frames, ['temperature', 'bedding_days']);
    expect(s.map((p) => p.tracks.temperature?.norm)).toEqual([0, 0.5, null, 1]);
    expect(s.map((p) => p.tracks.temperature?.raw)).toEqual([10, 20, null, 30]);
    expect(s.map((p) => p.tracks.bedding_days?.norm)).toEqual([0, 1 / 3, 2 / 3, 1]);
  });

  it('only includes requested tracks, marks wash days, and centres a flat track', () => {
    const flat = buildTimeSeries(frames.map((f) => ({ ...f, stress: 5 })), ['stress']);
    expect(flat.every((p) => p.tracks.stress?.norm === 0.5)).toBe(true);
    expect(Object.keys(flat[0]?.tracks ?? {})).toEqual(['stress']);
    expect(buildTimeSeries(frames, []).map((p) => p.washedToday)).toEqual([true, false, false, false]);
  });
});

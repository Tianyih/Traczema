/**
 * Time-lag alignment. An exposure on day t is compared with the outcome in a window of days
 * relative to t. Outcome = MAX severity over the window's known days (so "did a flare follow?").
 *
 *   T0   same day            window [0, 0]
 *   T1   next day            window [1, 1]
 *   T2   two days later      window [2, 2]
 *   W48  rolling 48 hours    window [1, 2]  (the two days after the exposure day; T0 is separate)
 */
import type { RegionId } from '@/db/types';
import { addDaysISO, type ISODate } from '@/lib/date';
import type { DayFrame } from '@/lib/derive/frames';
import {
  type AlignedDay,
  type AnalysisOptions,
  type LagId,
  FLARE_THRESHOLD,
  resolveOptions,
} from './types';

export interface LagSpec {
  id: LagId;
  startOffset: number;
  endOffset: number;
  /** i18n key name; resolved by the UI. */
  labelKey: string;
}

export const LAGS: Record<LagId, LagSpec> = {
  T0: { id: 'T0', startOffset: 0, endOffset: 0, labelKey: 'lag_T0' },
  T1: { id: 'T1', startOffset: 1, endOffset: 1, labelKey: 'lag_T1' },
  T2: { id: 'T2', startOffset: 2, endOffset: 2, labelKey: 'lag_T2' },
  W48: { id: 'W48', startOffset: 1, endOffset: 2, labelKey: 'lag_W48' },
};

/** The severity series the analysis is about: overall, or one region's carried-forward severity. */
export const outcomeSeverity = (frame: DayFrame, regionId: RegionId | null): number | null =>
  regionId ? frame.regionSeverity[regionId] : frame.severity;

export function alignFrames(frames: readonly DayFrame[], partial: Partial<AnalysisOptions> = {}): AlignedDay[] {
  const o = resolveOptions(partial);
  const lag = LAGS[o.lag];
  const byDate = new Map<ISODate, DayFrame>(frames.map((f) => [f.date, f]));
  const out: AlignedDay[] = [];

  for (const frame of frames) {
    if (o.from && frame.date < o.from) continue;
    if (o.to && frame.date > o.to) continue;

    if (o.onsetOnly) {
      const sameDay = outcomeSeverity(frame, o.regionId);
      if (sameDay !== null && sameDay >= FLARE_THRESHOLD) continue; // already flaring on the exposure day
    }

    let best: number | null = null;
    for (let k = lag.startOffset; k <= lag.endOffset; k++) {
      const target = byDate.get(k === 0 ? frame.date : addDaysISO(frame.date, k));
      if (!target) continue;
      const s = outcomeSeverity(target, o.regionId);
      if (s !== null && (best === null || s > best)) best = s;
    }
    if (best !== null) out.push({ date: frame.date, exposure: frame, outcome: best });
  }
  return out;
}

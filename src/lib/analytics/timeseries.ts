import type { DayFrame } from '@/lib/derive/frames';
import type { ISODate } from '@/lib/date';
import type { Unit, VariableId } from './types';

export const OVERLAY_TRACKS = ['temperature', 'humidity', 'stress', 'sleep_hours', 'bedding_days'] as const;
export type OverlayTrackId = (typeof OVERLAY_TRACKS)[number] & VariableId;

export const TRACK_DEFS: Record<OverlayTrackId, { labelKey: string; unit: Unit; read: (f: DayFrame) => number | null }> = {
  temperature: { labelKey: 'var_temperature', unit: 'celsius', read: (f) => f.tempC },
  humidity: { labelKey: 'var_humidity', unit: 'percent', read: (f) => f.humidityPct },
  stress: { labelKey: 'var_stress', unit: 'score', read: (f) => f.stress },
  sleep_hours: { labelKey: 'var_sleep_hours', unit: 'hours', read: (f) => f.sleepHours },
  bedding_days: { labelKey: 'var_bedding_days', unit: 'days', read: (f) => f.beddingDays },
};

export interface TrackValue {
  raw: number | null;
  /** Min–max scaled to [0, 1] over the whole series so tracks with different units can share an axis. */
  norm: number | null;
}

export interface TimeSeriesPoint {
  date: ISODate;
  severity: number | null;
  itch: number | null;
  /** True on a bedding wash day (for reference markers). */
  washedToday: boolean;
  tracks: Partial<Record<OverlayTrackId, TrackValue>>;
}

export function buildTimeSeries(frames: readonly DayFrame[], trackIds: readonly OverlayTrackId[]): TimeSeriesPoint[] {
  const ranges = new Map<OverlayTrackId, { min: number; max: number }>();
  for (const id of trackIds) {
    const values = frames.map((f) => TRACK_DEFS[id].read(f)).filter((v): v is number => v !== null);
    if (values.length > 0) ranges.set(id, { min: Math.min(...values), max: Math.max(...values) });
  }
  return frames.map((f) => {
    const tracks: TimeSeriesPoint['tracks'] = {};
    for (const id of trackIds) {
      const raw = TRACK_DEFS[id].read(f);
      const r = ranges.get(id);
      tracks[id] = {
        raw,
        norm: raw === null || !r ? null : r.max === r.min ? 0.5 : (raw - r.min) / (r.max - r.min),
      };
    }
    return { date: f.date, severity: f.severity, itch: f.itch, washedToday: f.beddingWashedToday === true, tracks };
  });
}

import { useMemo } from 'react';
import type { CustomRef } from '@/db/types';
import { buildRegistry, compileAllFactors, type FactorDef, type Variable } from '@/lib/analytics';
import { todayISO, type ISODate } from '@/lib/date';
import { buildFrames, type DayFrame } from '@/lib/derive/frames';
import { useStoredData } from './useCalendarData';
import { useTags } from './useTags';

export interface AnalyticsData {
  /** undefined while loading. */
  frames: DayFrame[] | undefined;
  registry: Variable[];
  factors: FactorDef[];
  /** User-authored tag labels (diet + activity), shown as typed in every language. */
  customLabels: Map<CustomRef, string>;
  /** Days with an overall severity logged. */
  severityDays: number;
}

/** Everything the analytics page needs: derived day frames over the full history, and the factor registry. */
export function useAnalyticsData(): AnalyticsData {
  const stored = useStoredData();
  const diet = useTags('diet');
  const activity = useTags('activity');

  const frames = useMemo(() => {
    if (!stored) return undefined;
    const dates: ISODate[] = [...stored.dailyLogs.map((l) => l.date), ...stored.bodyPartLogs.map((l) => l.date)];
    if (dates.length === 0) return [];
    const from = dates.reduce((a, b) => (a < b ? a : b));
    return buildFrames({ ...stored, from, to: todayISO() });
  }, [stored]);

  const dietRefs = diet.refs.join('|');
  const activityRefs = activity.refs.join('|');
  const registry = useMemo(() => buildRegistry({ customDietTags: diet.refs, customActivities: activity.refs }), [dietRefs, activityRefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const factors = useMemo(() => compileAllFactors(registry), [registry]);
  const customLabels = useMemo(() => new Map<CustomRef, string>([...diet.labels, ...activity.labels]), [diet.labels, activity.labels]);
  const severityDays = useMemo(() => (frames ?? []).filter((f) => f.severity !== null).length, [frames]);

  return { frames, registry, factors, customLabels, severityDays };
}

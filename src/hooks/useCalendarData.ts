import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { photoCountsByDate } from '@/db/repos/photoRepo';
import type { BodyPartLog, DailyLog } from '@/db/types';
import type { ISODate } from '@/lib/date';
import { buildFrames, type DayFrame } from '@/lib/derive/frames';
import { useDb } from './useDb';

export interface StoredData {
  dailyLogs: DailyLog[];
  bodyPartLogs: BodyPartLog[];
  photoCounts: Map<ISODate, number>;
}

/** Everything the calendar needs, kept live: re-renders when any log or photo changes. */
export function useStoredData(): StoredData | undefined {
  const { db } = useDb();
  const result = useLiveQuery(
    async () => {
      const [dailyLogs, bodyPartLogs, photoCounts] = await Promise.all([
        db.dailyLogs.orderBy('date').toArray(),
        db.bodyPartLogs.toArray(),
        photoCountsByDate(db),
      ]);
      return { dbName: db.name, dailyLogs, bodyPartLogs, photoCounts };
    },
    [db],
  );
  // useLiveQuery keeps returning the PREVIOUS query's result while a new one runs. After switching
  // between the real and demo databases that would flash the other database's data, so a result is
  // only accepted if it was read from the database currently shown.
  return result && result.dbName === db.name ? result : undefined;
}

/** Derived per-day frames for the visible range (bedding days, active flares, ...). */
export function useFrames(data: StoredData | undefined, from: ISODate, to: ISODate): Map<ISODate, DayFrame> {
  return useMemo(() => {
    if (!data) return new Map();
    const frames = buildFrames({ ...data, from, to });
    return new Map(frames.map((f) => [f.date, f]));
  }, [data, from, to]);
}

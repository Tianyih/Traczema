import type { BodyPartLog, DailyLog, LesionStatus, RegionId, ResidualSkin } from '@/db/types';
import { REGION_IDS } from '@/db/types';
import { emptyDailyLog } from '@/db/repos/dailyLogRepo';
import type { ISODate } from '@/lib/date';
import type { DayFrame } from '@/lib/derive/frames';

export const d = (s: string): ISODate => s as ISODate;

export function dailyLog(date: ISODate, over: Partial<DailyLog> = {}): DailyLog {
  return { ...emptyDailyLog(date, 1), ...over };
}

export function bodyLog(
  regionId: RegionId,
  date: ISODate,
  status: LesionStatus,
  severity = 0,
  residualSkin: ResidualSkin[] = [],
): BodyPartLog {
  return {
    id: `${regionId}-${date}`,
    regionId,
    date,
    status,
    severity,
    residualSkin,
    notes: '',
    createdAt: 1,
    updatedAt: 1,
  };
}

const nullRecord = <T>(v: T): Record<RegionId, T> => Object.fromEntries(REGION_IDS.map((r) => [r, v])) as Record<RegionId, T>;

/** A frame in which every exposure is unknown (null); override what a test cares about. */
export function frame(date: ISODate, over: Partial<DayFrame> = {}): DayFrame {
  return {
    date,
    hasLog: true,
    photoCount: 0,
    activeRegionCount: 0,
    severity: null,
    itch: null,
    regionSeverity: nullRecord<number | null>(null),
    regionStatus: nullRecord<LesionStatus | null>(null),
    tempC: null,
    humidityPct: null,
    stress: null,
    sleepHours: null,
    sleepQuality: null,
    exerciseMin: null,
    showerMin: null,
    beddingDays: null,
    beddingWashedToday: null,
    sweat: null,
    shower: null,
    cleansing: null,
    moisturized: null,
    activity: null,
    diet: null,
    clothing: null,
    ...over,
  };
}

/**
 * DayFrame: the flat, per-calendar-day view that the analytics engine consumes.
 * One frame exists for EVERY day in the range (including days with no log) so that lagged
 * windows align by calendar date, never by array position.
 */
import type {
  BodyPartLog,
  CleansingLevel,
  ClothingTag,
  DailyLog,
  LesionStatus,
  RegionId,
  SweatLevel,
  WaterTemp,
} from '@/db/types';
import { REGION_IDS } from '@/db/types';
import { eachDayISO, type ISODate } from '@/lib/date';
import { deriveBeddingSeries } from './bedding';
import { DEFAULT_MAX_CARRY_DAYS, regionDayStates } from './regionTimeline';

export interface DayFrame {
  date: ISODate;
  hasLog: boolean;
  photoCount: number;
  /** Calendar badge: regions whose carried-forward status is `active` today. */
  activeRegionCount: number;
  severity: number | null;
  itch: number | null;
  /** Carried-forward regional severity for analysis (see RegionDayState). */
  regionSeverity: Record<RegionId, number | null>;
  regionStatus: Record<RegionId, LesionStatus | null>;

  tempC: number | null;
  humidityPct: number | null;
  stress: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  exerciseMin: number | null;
  showerMin: number | null;
  /** Derived. */
  beddingDays: number | null;
  beddingWashedToday: boolean | null;

  sweat: SweatLevel | null;
  /** 'no_shower' when the log explicitly says no shower today. */
  shower: 'no_shower' | WaterTemp | null;
  cleansing: CleansingLevel | null;
  moisturized: boolean | null;
  activity: string | null;
  diet: readonly string[] | null;
  clothing: readonly ClothingTag[] | null;
}

export interface BuildFramesInput {
  dailyLogs: readonly DailyLog[];
  bodyPartLogs: readonly BodyPartLog[];
  photoCounts?: ReadonlyMap<ISODate, number>;
  from: ISODate;
  to: ISODate;
  maxCarryDays?: number;
}

const emptyRecord = <T,>(value: T): Record<RegionId, T> => {
  const out = {} as Record<RegionId, T>;
  for (const id of REGION_IDS) out[id] = value;
  return out;
};

export function buildFrames(input: BuildFramesInput): DayFrame[] {
  const { dailyLogs, bodyPartLogs, photoCounts, from, to } = input;
  const maxCarry = input.maxCarryDays ?? DEFAULT_MAX_CARRY_DAYS;
  const days = eachDayISO(from, to);
  const logByDate = new Map<ISODate, DailyLog>(dailyLogs.map((l) => [l.date, l]));
  // Bedding resets before `from` still matter, so derive from the full log history.
  const bedding = deriveBeddingSeries(dailyLogs, from, to);
  const regionStates = Object.fromEntries(
    REGION_IDS.map((id) => [id, regionDayStates(bodyPartLogs, id, from, to, maxCarry)]),
  ) as Record<RegionId, ReturnType<typeof regionDayStates>>;

  return days.map((date, i): DayFrame => {
    const log = logByDate.get(date) ?? null;
    const regionSeverity = emptyRecord<number | null>(null);
    const regionStatus = emptyRecord<LesionStatus | null>(null);
    let activeRegionCount = 0;
    for (const id of REGION_IDS) {
      const st = regionStates[id][i];
      regionSeverity[id] = st?.severity ?? null;
      regionStatus[id] = st?.status ?? null;
      if (st?.status === 'active') activeRegionCount++;
    }
    const shower = log?.shower ?? null;
    return {
      date,
      hasLog: log !== null,
      photoCount: photoCounts?.get(date) ?? 0,
      activeRegionCount,
      severity: log?.overallSeverity ?? null,
      itch: log?.itchIntensity ?? null,
      regionSeverity,
      regionStatus,
      tempC: log?.weather?.temperatureC ?? null,
      humidityPct: log?.weather?.humidityPct ?? null,
      stress: log?.stressLevel ?? null,
      sleepHours: log?.sleep?.hours ?? null,
      sleepQuality: log?.sleep?.quality ?? null,
      exerciseMin: log?.exercise?.durationMin ?? null,
      showerMin: shower?.took ? shower.durationMin : null,
      beddingDays: bedding[i]?.daysSinceWash ?? null,
      beddingWashedToday: log?.bedding ? log.bedding.washedToday : null,
      sweat: log?.exercise?.sweat ?? null,
      shower: shower === null ? null : shower.took ? (shower.waterTemp ?? null) : 'no_shower',
      cleansing: shower?.took ? shower.cleansing : null,
      moisturized: shower?.took ? shower.moisturizedWithin3Min : null,
      activity: log?.exercise?.activity ?? null,
      diet: log?.dietTags ?? null,
      clothing: log?.clothing ?? null,
    };
  });
}

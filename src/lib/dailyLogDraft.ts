/**
 * Pure helpers behind the Daily Log drawer: what counts as "empty", how sections collapse back to
 * `null` (= not recorded), and the bedding "days ago" <-> date conversion. The user never types a
 * calculated value: they say "last washed N days ago" and we store the DATE (log date − N).
 */
import type { DailyLog } from '@/db/types';
import { addDaysISO, diffDays, type ISODate } from './date';

export const defaultWeather = (): NonNullable<DailyLog['weather']> => ({ temperatureC: null, humidityPct: null, source: 'manual', fetchedAt: null });
export const defaultExercise = (): NonNullable<DailyLog['exercise']> => ({ durationMin: null, activity: null, sweat: null });
export const defaultShower = (took: boolean): NonNullable<DailyLog['shower']> => ({ took, durationMin: null, waterTemp: null, cleansing: null, moisturizedWithin3Min: null });
export const defaultSleep = (): NonNullable<DailyLog['sleep']> => ({ hours: null, quality: null });
export const defaultBedding = (): NonNullable<DailyLog['bedding']> => ({ washedToday: false, assumedLastWashDate: null });

/** Empty text input -> null, otherwise a finite number (NaN / junk -> null). */
export function parseNumberInput(raw: string): number | null {
  const s = raw.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Collapse sections that carry no information back to `null` so "not recorded" is preserved, and
 * clear fields that can't apply (e.g. shower details when there was no shower).
 */
export function normalizeForSave(log: DailyLog): DailyLog {
  const out: DailyLog = { ...log, notes: log.notes.trim() === '' ? '' : log.notes.replace(/\s+$/, '') };

  if (out.weather && out.weather.temperatureC === null && out.weather.humidityPct === null) out.weather = null;
  if (out.exercise && out.exercise.durationMin === null && out.exercise.activity === null && out.exercise.sweat === null) out.exercise = null;

  if (out.shower && !out.shower.took) out.shower = defaultShower(false);
  else if (out.shower?.took && out.shower.moisturizedWithin3Min === null && out.shower.durationMin === null && out.shower.waterTemp === null && out.shower.cleansing === null) {
    out.shower = { ...out.shower }; // "took a shower" with no details is still information
  }

  if (out.clothing && out.clothing.length === 0) out.clothing = null; // no "none" meaning for clothing
  if (out.sleep && out.sleep.hours === null && out.sleep.quality === null) out.sleep = null;

  if (out.bedding) {
    const b = out.bedding.washedToday ? { washedToday: true, assumedLastWashDate: null } : out.bedding;
    out.bedding = !b.washedToday && b.assumedLastWashDate === null ? null : b;
  }
  return out;
}

/** True when nothing is recorded at all (ignoring timestamps). */
export function isLogEmpty(log: DailyLog): boolean {
  const n = normalizeForSave(log);
  return (
    n.overallSeverity === null && n.itchIntensity === null && n.notes === '' && n.dietTags === null && n.weather === null &&
    n.exercise === null && n.shower === null && n.clothing === null && n.bedding === null && n.stressLevel === null && n.sleep === null
  );
}

/** Content equality that ignores createdAt / updatedAt (for the "unsaved changes" check). */
export function sameLogContent(a: DailyLog, b: DailyLog): boolean {
  const strip = ({ createdAt: _c, updatedAt: _u, ...rest }: DailyLog) => JSON.stringify(normalizeForSave({ ...rest, createdAt: 0, updatedAt: 0 }));
  return strip(a) === strip(b);
}

/** "Last washed N days ago" as shown in the UI, derived from the stored anchor date. */
export function assumedDaysAgo(log: DailyLog): number | null {
  const anchor = log.bedding?.assumedLastWashDate ?? null;
  return anchor === null ? null : diffDays(log.date, anchor);
}

/** Store "N days ago" as a date (log date − N). N null/invalid clears the anchor. */
export function withAssumedDaysAgo(log: DailyLog, days: number | null): DailyLog {
  const bedding = log.bedding ?? defaultBedding();
  if (days === null || !Number.isInteger(days) || days < 0) return { ...log, bedding: { ...bedding, assumedLastWashDate: null } };
  return { ...log, bedding: { washedToday: false, assumedLastWashDate: addDaysISO(log.date, -days) as ISODate } };
}

/** The history the bedding counter should use: stored logs with the draft replacing its own day. */
export function logsWithDraft(stored: readonly DailyLog[], draft: DailyLog): DailyLog[] {
  return [...stored.filter((l) => l.date !== draft.date), draft];
}

/** Toggle a value in a list, preserving insertion order. */
export const toggleIn = <T,>(list: readonly T[], value: T): T[] => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

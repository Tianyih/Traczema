import type { TraczemaDB } from '../schema';
import type { DailyLog, ISODate } from '../types';
import { validateDailyLog } from '../validate';

/** A new, completely empty log: every section `null` (= not recorded). */
export function emptyDailyLog(date: ISODate, now: number = Date.now()): DailyLog {
  return {
    date,
    overallSeverity: null,
    itchIntensity: null,
    notes: '',
    dietTags: null,
    weather: null,
    exercise: null,
    shower: null,
    clothing: null,
    bedding: null,
    stressLevel: null,
    sleep: null,
    createdAt: now,
    updatedAt: now,
  };
}

export const getDailyLog = (db: TraczemaDB, date: ISODate) => db.dailyLogs.get(date);

/** All logs, oldest first. Optional inclusive date bounds. */
export function listDailyLogs(db: TraczemaDB, from?: ISODate, to?: ISODate): Promise<DailyLog[]> {
  if (from && to) return db.dailyLogs.where('date').between(from, to, true, true).toArray();
  if (from) return db.dailyLogs.where('date').aboveOrEqual(from).toArray();
  if (to) return db.dailyLogs.where('date').belowOrEqual(to).toArray();
  return db.dailyLogs.orderBy('date').toArray();
}

/** Insert or replace a day. `createdAt` is preserved across updates. */
export async function saveDailyLog(db: TraczemaDB, log: DailyLog, now: number = Date.now()): Promise<DailyLog> {
  validateDailyLog(log);
  return db.transaction('rw', db.dailyLogs, async () => {
    const existing = await db.dailyLogs.get(log.date);
    const saved: DailyLog = { ...log, createdAt: existing?.createdAt ?? log.createdAt ?? now, updatedAt: now };
    await db.dailyLogs.put(saved);
    return saved;
  });
}

export const deleteDailyLog = (db: TraczemaDB, date: ISODate) => db.dailyLogs.delete(date);

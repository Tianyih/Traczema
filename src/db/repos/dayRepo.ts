/**
 * A "day" is the daily log plus its whole-day photos. The drawer edits both and commits them in a
 * single transaction, so a failed save never leaves a half-written day.
 */
import { isLogEmpty, normalizeForSave } from '@/lib/dailyLogDraft';
import { validateDailyLog } from '../validate';
import type { TraczemaDB } from '../schema';
import type { DailyLog, ISODate, PhotoRecord } from '../types';

export interface DayData {
  log: DailyLog | null;
  /** Whole-day photos (regionId = null), oldest first. */
  photos: PhotoRecord[];
}

export async function loadDay(db: TraczemaDB, date: ISODate): Promise<DayData> {
  const [log, onDate] = await Promise.all([db.dailyLogs.get(date), db.photos.where('date').equals(date).toArray()]);
  // IndexedDB cannot index `null`, so whole-day photos are picked out of the date index.
  const photos = onDate.filter((p) => p.regionId === null).sort((a, b) => a.createdAt - b.createdAt);
  return { log: log ?? null, photos };
}

export interface SaveDayInput {
  log: DailyLog;
  /** The full set of whole-day photos that should exist after saving. */
  photos: PhotoRecord[];
  /** Photo ids that existed before and have been removed in the editor. */
  removedPhotoIds: string[];
}

export interface SaveDayResult {
  /** false when the log had nothing in it, so no daily-log row exists (photos may still be saved). */
  logStored: boolean;
}

export async function saveDay(db: TraczemaDB, input: SaveDayInput, now: number = Date.now()): Promise<SaveDayResult> {
  const log = normalizeForSave(input.log);
  const empty = isLogEmpty(log);
  if (!empty) validateDailyLog(log);

  return db.transaction('rw', db.dailyLogs, db.photos, async () => {
    if (empty) {
      await db.dailyLogs.delete(log.date);
    } else {
      const existing = await db.dailyLogs.get(log.date);
      await db.dailyLogs.put({ ...log, createdAt: existing?.createdAt ?? log.createdAt ?? now, updatedAt: now });
    }
    if (input.removedPhotoIds.length > 0) await db.photos.bulkDelete(input.removedPhotoIds);
    if (input.photos.length > 0) await db.photos.bulkPut(input.photos);
    return { logStored: !empty };
  });
}

/** Remove a day's log and its whole-day photos. Body-part photos for that date are kept. */
export async function deleteDay(db: TraczemaDB, date: ISODate): Promise<void> {
  await db.transaction('rw', db.dailyLogs, db.photos, async () => {
    await db.dailyLogs.delete(date);
    const ids = (await db.photos.where('date').equals(date).toArray()).filter((p) => p.regionId === null).map((p) => p.id);
    await db.photos.bulkDelete(ids);
  });
}

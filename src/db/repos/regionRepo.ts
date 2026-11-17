/**
 * An "observation" is a body-part log plus the photos taken that day for that body part. It is
 * committed in ONE transaction so a failed save never leaves a log without its photos (or vice versa).
 */
import { normalizeBodyPartInput, type BodyPartLogInput } from './bodyPartRepo';
import type { TraczemaDB } from '../schema';
import type { BodyPartLog, ISODate, PhotoRecord, RegionId } from '../types';
import { validateBodyPartLog } from '../validate';

export interface SaveObservationInput {
  log: BodyPartLogInput;
  /** Every photo that should exist for (region, date) after saving. */
  photos: PhotoRecord[];
  removedPhotoIds: string[];
}

export async function saveObservation(
  db: TraczemaDB,
  input: SaveObservationInput,
  now: number = Date.now(),
  newId: () => string = () => crypto.randomUUID(),
): Promise<BodyPartLog> {
  const base = normalizeBodyPartInput(input.log);
  return db.transaction('rw', db.bodyPartLogs, db.photos, async () => {
    const existing = await db.bodyPartLogs.where('[regionId+date]').equals([base.regionId, base.date]).first();
    const row: BodyPartLog = { ...base, id: existing?.id ?? newId(), createdAt: existing?.createdAt ?? now, updatedAt: now };
    validateBodyPartLog(row); // throws inside the transaction -> nothing is written
    await db.bodyPartLogs.put(row);
    if (input.removedPhotoIds.length > 0) await db.photos.bulkDelete(input.removedPhotoIds);
    if (input.photos.length > 0) {
      await db.photos.bulkPut(input.photos.map((p) => ({ ...p, regionId: base.regionId, date: base.date })));
    }
    return row;
  });
}

/** Photos for one body part on one day. */
export const loadObservationPhotos = (db: TraczemaDB, regionId: RegionId, date: ISODate): Promise<PhotoRecord[]> =>
  db.photos.where('[regionId+date]').equals([regionId, date]).sortBy('createdAt');

/** Delete an observation and that day's photos for the same body part. */
export async function deleteObservation(db: TraczemaDB, id: string): Promise<void> {
  await db.transaction('rw', db.bodyPartLogs, db.photos, async () => {
    const log = await db.bodyPartLogs.get(id);
    if (!log) return;
    const ids = (await db.photos.where('[regionId+date]').equals([log.regionId, log.date]).toArray()).map((p) => p.id);
    await db.photos.bulkDelete(ids);
    await db.bodyPartLogs.delete(id);
  });
}

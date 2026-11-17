import type { TraczemaDB } from '../schema';
import type { ISODate, PhotoRecord, RegionId } from '../types';

export const addPhoto = (db: TraczemaDB, photo: PhotoRecord) => db.photos.put(photo);
export const getPhoto = (db: TraczemaDB, id: string) => db.photos.get(id);
export const deletePhoto = (db: TraczemaDB, id: string) => db.photos.delete(id);

export interface PhotoQuery {
  date?: ISODate;
  regionId?: RegionId;
}

/** Photos oldest-first (by date, then creation time). */
export async function listPhotos(db: TraczemaDB, q: PhotoQuery = {}): Promise<PhotoRecord[]> {
  let rows: PhotoRecord[];
  if (q.regionId && q.date) rows = await db.photos.where('[regionId+date]').equals([q.regionId, q.date]).toArray();
  else if (q.regionId) rows = await db.photos.where('regionId').equals(q.regionId).toArray();
  else if (q.date) rows = await db.photos.where('date').equals(q.date).toArray();
  else rows = await db.photos.toArray();
  return rows.sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
}

/** Photos per day, computed from the date index only so image Blobs are never loaded. */
export async function photoCountsByDate(db: TraczemaDB): Promise<Map<ISODate, number>> {
  const counts = new Map<ISODate, number>();
  await db.photos.orderBy('date').eachKey((k) => {
    const d = k as ISODate;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  });
  return counts;
}

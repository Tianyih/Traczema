import type { TraczemaDB } from '../schema';
import type { BodyPartLog, ISODate, LesionStatus, RegionId, ResidualSkin } from '../types';
import { validateBodyPartLog } from '../validate';

export interface BodyPartLogInput {
  regionId: RegionId;
  date: ISODate;
  status: LesionStatus;
  severity: number;
  residualSkin?: ResidualSkin[];
  notes?: string;
}

/** Normalise an input so it satisfies the lifecycle invariants (used by forms and the seeder). */
export function normalizeBodyPartInput(input: BodyPartLogInput): Omit<BodyPartLog, 'id' | 'createdAt' | 'updatedAt'> {
  const resolved = input.status === 'healing' || input.status === 'healed';
  const severity = input.status === 'clear' || input.status === 'healed' ? 0 : input.severity;
  return {
    regionId: input.regionId,
    date: input.date,
    status: input.status,
    severity,
    residualSkin: resolved ? [...(input.residualSkin ?? [])] : [],
    notes: input.notes ?? '',
  };
}

/** Logs oldest-first, optionally for one region. */
export async function listBodyPartLogs(db: TraczemaDB, regionId?: RegionId): Promise<BodyPartLog[]> {
  const rows = regionId
    ? await db.bodyPartLogs.where('regionId').equals(regionId).toArray()
    : await db.bodyPartLogs.toArray();
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Upsert by (regionId, date); the existing id and createdAt are preserved. */
export async function upsertBodyPartLog(
  db: TraczemaDB,
  input: BodyPartLogInput,
  now: number = Date.now(),
  newId: () => string = () => crypto.randomUUID(),
): Promise<BodyPartLog> {
  const base = normalizeBodyPartInput(input);
  return db.transaction('rw', db.bodyPartLogs, async () => {
    const existing = await db.bodyPartLogs.where('[regionId+date]').equals([base.regionId, base.date]).first();
    const row: BodyPartLog = {
      ...base,
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    validateBodyPartLog(row);
    await db.bodyPartLogs.put(row);
    return row;
  });
}

export const deleteBodyPartLog = (db: TraczemaDB, id: string) => db.bodyPartLogs.delete(id);

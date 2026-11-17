import Dexie, { type Table } from 'dexie';
import type { BodyPartLog, DailyLog, ID, ISODate, PhotoRecord, SettingRow, TagDef } from './types';

export type DbMode = 'real' | 'demo';

/** Real and demo data live in two separate databases so demo data can never touch real logs. */
export const DB_NAMES: Record<DbMode, string> = {
  real: 'traczema',
  demo: 'traczema-demo',
};

export class TraczemaDB extends Dexie {
  dailyLogs!: Table<DailyLog, ISODate>;
  bodyPartLogs!: Table<BodyPartLog, ID>;
  photos!: Table<PhotoRecord, ID>;
  tagDefs!: Table<TagDef, ID>;
  settings!: Table<SettingRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      dailyLogs: 'date',
      // &[regionId+date] enforces a single observation per region per day (upsert by this key).
      bodyPartLogs: 'id, &[regionId+date], date, regionId',
      photos: 'id, date, regionId, [regionId+date], *tags',
      tagDefs: 'id, &[kind+label]',
      settings: 'key',
    });
  }
}

const instances = new Map<DbMode, TraczemaDB>();

export function getDb(mode: DbMode = 'real'): TraczemaDB {
  let db = instances.get(mode);
  if (!db) {
    db = new TraczemaDB(DB_NAMES[mode]);
    instances.set(mode, db);
  }
  return db;
}

/** Wipe every table in a database (used by "clear demo data" and tests). */
export async function clearAllTables(db: TraczemaDB): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

/** Delete the whole demo database (closing any open handle first). */
export async function deleteDemoDb(): Promise<void> {
  const open = instances.get('demo');
  if (open) {
    open.close();
    instances.delete('demo');
  }
  await Dexie.delete(DB_NAMES.demo);
}

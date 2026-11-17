import type { TraczemaDB } from '../schema';

export async function getSetting<T>(db: TraczemaDB, key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined;
}

export const setSetting = (db: TraczemaDB, key: string, value: unknown) => db.settings.put({ key, value });

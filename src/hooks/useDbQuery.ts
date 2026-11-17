import { useLiveQuery } from 'dexie-react-hooks';
import type { TraczemaDB } from '@/db/schema';
import { useDb } from './useDb';

/**
 * Live query against the CURRENT database. `useLiveQuery` keeps returning the previous query's result
 * while a new one runs, which would flash another database's (or another region's) data. Each result is
 * therefore tagged with the database and dependency key it was read for, and rejected on a mismatch.
 */
export function useDbQuery<T>(query: (db: TraczemaDB) => Promise<T>, deps: readonly unknown[] = []): T | undefined {
  const { db } = useDb();
  const key = JSON.stringify(deps);
  const result = useLiveQuery(async () => ({ dbName: db.name, key, value: await query(db) }), [db, key]);
  return result && result.dbName === db.name && result.key === key ? result.value : undefined;
}

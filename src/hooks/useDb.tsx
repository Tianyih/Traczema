import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { clearAllTables, getDb, type DbMode, type TraczemaDB } from '@/db/schema';
import { seedDemoData, type ResolveText, type SeedResult } from '@/db/seed';
import { todayISO } from '@/lib/date';

const MODE_KEY = 'traczema.dbmode';

function readMode(): DbMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'real';
  } catch {
    return 'real';
  }
}

export interface DbContextValue {
  mode: DbMode;
  /** The database currently shown. Real and demo data are physically separate databases. */
  db: TraczemaDB;
  setMode: (mode: DbMode) => void;
  /** Fill the DEMO database with 60 days of data and switch to it. Never touches real data. */
  seedDemo: (resolveText: ResolveText) => Promise<SeedResult>;
  /** Empty the DEMO database and switch back to real data. */
  clearDemo: () => Promise<void>;
}

const DbContext = createContext<DbContextValue | null>(null);

export function DbProvider({ children, initialMode }: { children: ReactNode; initialMode?: DbMode }) {
  const [mode, setModeState] = useState<DbMode>(() => initialMode ?? readMode());

  const setMode = useCallback((next: DbMode) => {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* session-only */
    }
  }, []);

  const value = useMemo<DbContextValue>(
    () => ({
      mode,
      db: getDb(mode),
      setMode,
      seedDemo: async (resolveText) => {
        const result = await seedDemoData(getDb('demo'), { endDate: todayISO() }, resolveText);
        setMode('demo');
        return result;
      },
      clearDemo: async () => {
        await clearAllTables(getDb('demo'));
        setMode('real');
      },
    }),
    [mode, setMode],
  );

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used inside <DbProvider>');
  return ctx;
}

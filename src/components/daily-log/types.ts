import type { DailyLog, PhotoRecord } from '@/db/types';

export type UpdateLog = (fn: (log: DailyLog) => DailyLog) => void;

/** A whole-day photo being edited. `isNew` photos have not been written to IndexedDB yet. */
export interface PhotoDraft extends PhotoRecord {
  isNew: boolean;
}

export interface SectionProps {
  log: DailyLog;
  update: UpdateLog;
}

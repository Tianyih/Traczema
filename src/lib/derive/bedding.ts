/**
 * Days since last bedding wash — always derived, never typed by the user (CLAUDE.md rule 1).
 *
 * A "reset" is either an explicit log with `washedToday: true`, or a manual anchor
 * (`assumedLastWashDate`) entered when no earlier wash is known. For any day the last reset on or
 * before it wins, so an explicit wash naturally supersedes an older assumption. A wash day is 0.
 */
import type { DailyLog } from '@/db/types';
import { diffDays, eachDayISO, type ISODate } from '@/lib/date';

export type BeddingSource = 'logged' | 'assumed';

export interface BeddingInfo {
  /** null = unknown (no wash or anchor on or before this day). */
  daysSinceWash: number | null;
  lastResetDate: ISODate | null;
  source: BeddingSource | null;
}

export const UNKNOWN_BEDDING: BeddingInfo = { daysSinceWash: null, lastResetDate: null, source: null };

interface Reset {
  date: ISODate;
  source: BeddingSource;
}

export function collectBeddingResets(logs: readonly Pick<DailyLog, 'date' | 'bedding'>[]): Reset[] {
  const byDate = new Map<ISODate, BeddingSource>();
  for (const log of logs) {
    const b = log.bedding;
    if (!b) continue;
    if (b.assumedLastWashDate && !byDate.has(b.assumedLastWashDate)) byDate.set(b.assumedLastWashDate, 'assumed');
    if (b.washedToday) byDate.set(log.date, 'logged'); // an explicit wash beats an assumption on the same date
  }
  return [...byDate.entries()]
    .map(([date, source]) => ({ date, source }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** One BeddingInfo per calendar day in [from, to], aligned with `eachDayISO(from, to)`. */
export function deriveBeddingSeries(
  logs: readonly Pick<DailyLog, 'date' | 'bedding'>[],
  from: ISODate,
  to: ISODate,
): BeddingInfo[] {
  const resets = collectBeddingResets(logs);
  const days = eachDayISO(from, to);
  const out: BeddingInfo[] = [];
  let next = 0; // index of the first reset after the current day
  let current: Reset | null = null;
  for (const day of days) {
    while (next < resets.length && (resets[next] as Reset).date <= day) {
      current = resets[next] as Reset;
      next++;
    }
    out.push(
      current
        ? { daysSinceWash: diffDays(day, current.date), lastResetDate: current.date, source: current.source }
        : UNKNOWN_BEDDING,
    );
  }
  return out;
}

export function deriveBeddingForDate(
  logs: readonly Pick<DailyLog, 'date' | 'bedding'>[],
  date: ISODate,
): BeddingInfo {
  return deriveBeddingSeries(logs, date, date)[0] ?? UNKNOWN_BEDDING;
}

/**
 * Whether the manual "days since last wash" override should be offered for a log on `date`:
 * only when no explicit wash exists on or before it.
 */
export function canOverrideBedding(logs: readonly Pick<DailyLog, 'date' | 'bedding'>[], date: ISODate): boolean {
  return !logs.some((l) => l.bedding?.washedToday && l.date <= date);
}

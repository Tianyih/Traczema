import { addDays, addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, type Locale } from 'date-fns';
import { fromISODate, toISODate, type ISODate } from './date';

export type CalendarView = 'month' | 'week';
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CalendarGrid {
  /** Rows of 7 consecutive days. */
  weeks: ISODate[][];
  from: ISODate;
  to: ISODate;
}

/** The visible grid for an anchor date: whole weeks covering the month, or the single anchor week. */
export function buildGrid(anchor: ISODate, view: CalendarView, weekStartsOn: WeekStart): CalendarGrid {
  const a = fromISODate(anchor);
  const start = startOfWeek(view === 'month' ? startOfMonth(a) : a, { weekStartsOn });
  const end = endOfWeek(view === 'month' ? endOfMonth(a) : a, { weekStartsOn });
  const weeks: ISODate[][] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => toISODate(addDays(cursor, i))));
  }
  return { weeks, from: toISODate(start), to: toISODate(end) };
}

/** Move the anchor one month / week. Months clamp the day (Jan 31 -> Feb 28/29). */
export function shiftAnchor(anchor: ISODate, view: CalendarView, direction: -1 | 1): ISODate {
  const a = fromISODate(anchor);
  return toISODate(view === 'month' ? addMonths(a, direction) : addDays(a, 7 * direction));
}

export const isSameMonth = (a: ISODate, b: ISODate): boolean => a.slice(0, 7) === b.slice(0, 7);

/** Short weekday names starting from the locale's first day of the week. */
export function weekdayLabels(weekStartsOn: WeekStart, locale: Locale, pattern = 'EEEEEE'): string[] {
  const start = startOfWeek(new Date(2024, 0, 3), { weekStartsOn }); // any fixed week works
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), pattern, { locale }));
}

/**
 * The part of a visible grid for which data can exist. Frames stop at today: lesion state is carried
 * forward in time, so computing frames for future days would show flare badges for days that have
 * not happened yet.
 */
export function dataRange(grid: { from: ISODate; to: ISODate }, today: ISODate): { from: ISODate; to: ISODate } {
  return { from: grid.from, to: grid.to > today ? today : grid.to };
}

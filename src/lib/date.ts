/**
 * All calendar-date math lives here.
 *
 * A "date" in this app is a LOCAL calendar day serialised as 'YYYY-MM-DD'. We never use
 * `new Date('YYYY-MM-DD')` (that parses as UTC and shifts the day in negative-offset zones)
 * and we diff days with `differenceInCalendarDays`, which is DST-safe.
 */
import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  parse,
  type Locale,
} from 'date-fns';

export type ISODate = `${number}-${number}-${number}`;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_FMT = 'yyyy-MM-dd';

/** True for a well-formed, real calendar date ('2024-02-30' is rejected). */
export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const d = parse(value, ISO_FMT, new Date(2000, 0, 1));
  return isValid(d) && format(d, ISO_FMT) === value;
}

export function fromISODate(value: ISODate): Date {
  const d = parse(value, ISO_FMT, new Date(2000, 0, 1));
  if (!isValid(d)) throw new RangeError(`Invalid ISO date: ${value}`);
  return d;
}

export function toISODate(date: Date): ISODate {
  return format(date, ISO_FMT) as ISODate;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDaysISO(value: ISODate, days: number): ISODate {
  return toISODate(addDays(fromISODate(value), days));
}

/** Whole calendar days from `b` to `a` (a − b). Positive when `a` is later. */
export function diffDays(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(fromISODate(a), fromISODate(b));
}

/** Inclusive list of every calendar day from `from` to `to` (empty if to < from). */
export function eachDayISO(from: ISODate, to: ISODate): ISODate[] {
  const n = diffDays(to, from);
  if (n < 0) return [];
  const out: ISODate[] = [];
  const start = fromISODate(from);
  for (let i = 0; i <= n; i++) out.push(toISODate(addDays(start, i)));
  return out;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b; // ISO strings sort chronologically
}

/** Display formatting. The format string and locale come from the UI layer (i18n). */
export function formatISO(value: ISODate, fmt: string, locale?: Locale): string {
  return format(fromISODate(value), fmt, locale ? { locale } : undefined);
}

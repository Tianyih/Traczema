/**
 * Pure helpers behind the body-part observation form and views. No React, no database.
 * Calculated values (days affected, recurrence, remission) are NOT computed here: they come from
 * `derive/regionTimeline`. These helpers only decide defaults, warnings and per-date lookups.
 */
import type { BodyPartLog, LesionStatus, RegionId, ResidualSkin } from '@/db/types';
import { diffDays, type ISODate } from './date';
import type { RegionSummary } from './derive/regionTimeline';
import { isUsualTransition } from './regions';

/** An open episode with no new observation for this long is flagged "still active?". */
export const STALE_AFTER_DAYS = 14;

const byDate = (a: { date: ISODate }, b: { date: ISODate }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** A region's observations, oldest first. */
export const regionLogs = (logs: readonly BodyPartLog[], regionId: RegionId): BodyPartLog[] =>
  logs.filter((l) => l.regionId === regionId).sort(byDate);

/** The observation recorded exactly on `date`, if any. */
export const observationOn = (logs: readonly BodyPartLog[], regionId: RegionId, date: ISODate): BodyPartLog | null =>
  logs.find((l) => l.regionId === regionId && l.date === date) ?? null;

/** The latest observation strictly BEFORE `date`. */
export function previousObservation(logs: readonly BodyPartLog[], regionId: RegionId, date: ISODate): BodyPartLog | null {
  let best: BodyPartLog | null = null;
  for (const l of logs) {
    if (l.regionId === regionId && l.date < date && (!best || l.date > best.date)) best = l;
  }
  return best;
}

/** The carried-forward status on `date` (latest observation on or before it); null if never observed. */
export function statusOnDate(logs: readonly BodyPartLog[], regionId: RegionId, date: ISODate): LesionStatus | null {
  let best: BodyPartLog | null = null;
  for (const l of logs) {
    if (l.regionId === regionId && l.date <= date && (!best || l.date > best.date)) best = l;
  }
  return best?.status ?? null;
}

export interface ObservationDraft {
  status: LesionStatus;
  severity: number;
  residualSkin: ResidualSkin[];
  notes: string;
}

/** Sensible starting severity when the user picks a status. */
export const defaultSeverityFor = (status: LesionStatus): number => (status === 'active' ? 5 : status === 'healing' ? 3 : 0);

/**
 * What the form starts with for (region, date): the existing observation if there is one,
 * otherwise a follow-up on the previous observation (same status / severity / skin state), otherwise
 * a first observation as an active flare.
 */
export function initialDraft(logs: readonly BodyPartLog[], regionId: RegionId, date: ISODate): ObservationDraft {
  const existing = observationOn(logs, regionId, date);
  if (existing) {
    return { status: existing.status, severity: existing.severity, residualSkin: [...existing.residualSkin], notes: existing.notes };
  }
  const prev = previousObservation(logs, regionId, date);
  if (prev) return { status: prev.status, severity: prev.severity, residualSkin: [...prev.residualSkin], notes: '' };
  return { status: 'active', severity: defaultSeverityFor('active'), residualSkin: [], notes: '' };
}

/** Changing the status keeps the draft internally consistent (severity range, residual skin). */
export function withStatus(draft: ObservationDraft, status: LesionStatus): ObservationDraft {
  const resolved = status === 'healing' || status === 'healed';
  const severity =
    status === 'clear' || status === 'healed'
      ? 0
      : status === 'active'
        ? Math.max(1, draft.severity || defaultSeverityFor('active'))
        : draft.status === 'active' || draft.status === 'healing'
          ? draft.severity
          : defaultSeverityFor('healing');
  return { ...draft, status, severity, residualSkin: resolved ? draft.residualSkin : [] };
}

/** 'normal_skin' is exclusive: choosing it clears the others, choosing another clears it. */
export function toggleResidual(current: readonly ResidualSkin[], value: ResidualSkin): ResidualSkin[] {
  if (current.includes(value)) return current.filter((v) => v !== value);
  if (value === 'normal_skin') return ['normal_skin'];
  return [...current.filter((v) => v !== 'normal_skin'), value];
}

/**
 * Warn (but never block) when a change is outside the usual lifecycle. Returns null for the first
 * observation of a region and for usual transitions.
 */
export function unusualTransition(
  logs: readonly BodyPartLog[],
  regionId: RegionId,
  date: ISODate,
  next: LesionStatus,
): { from: LesionStatus; to: LesionStatus } | null {
  const prev = previousObservation(logs, regionId, date);
  if (!prev) return null;
  return isUsualTransition(prev.status, next) ? null : { from: prev.status, to: next };
}

/** Open episode that nobody has updated for a while: nudge the user to confirm it. */
export function isStale(summary: RegionSummary): boolean {
  return summary.currentEpisode !== null && (summary.daysSinceLastLog ?? 0) >= STALE_AFTER_DAYS;
}

/** Days between two photos (always non-negative). */
export const daysApart = (a: ISODate, b: ISODate): number => Math.abs(diffDays(a, b));

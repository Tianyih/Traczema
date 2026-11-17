/**
 * Lesion lifecycle state machine for one anatomical region.
 *
 * The function is TOTAL: it accepts any sequence of observations. (The UI separately warns about
 * unusual transitions via `STATUS_TRANSITIONS`.) State between observations is carried forward
 * (LOCF) until the next one.
 *
 *  - An episode OPENS when the region enters `active` or `healing` while no episode is open.
 *  - It CLOSES when the region enters `healed` or `clear`. `endDate` is that first resolved day
 *    (exclusive), so the closing day is not counted as affected.
 *  - `daysAffected` = calendar days in [startDate, endDate) — or [startDate, asOf] if still open.
 *  - `isRecurrence` = a previous episode existed (index > 1). A region whose very first
 *    observation is `clear` and then flares is an onset, not a recurrence.
 *  - Remission = days from the previous closure to the next onset.
 *  - healing → active inside an open episode is a worsening, not a recurrence.
 */
import type { BodyPartLog, LesionStatus, RegionId, ResidualSkin } from '@/db/types';
import { REGION_IDS } from '@/db/types';
import { addDaysISO, diffDays, eachDayISO, type ISODate } from '@/lib/date';
import { isAffectedStatus } from '@/lib/regions';

export interface Episode {
  regionId: RegionId;
  /** 1-based. */
  index: number;
  startDate: ISODate;
  /** First day in healed/clear (exclusive end). null = ongoing. */
  endDate: ISODate | null;
  closedAs: 'healed' | 'clear' | null;
  daysAffected: number;
  daysActive: number;
  daysHealing: number;
  peakSeverity: number;
  peakDate: ISODate;
  isRecurrence: boolean;
  /** Days between the previous closure and this onset; null for the first episode. */
  remissionBeforeDays: number | null;
  residualSkin: ResidualSkin[];
}

export interface RegionSummary {
  regionId: RegionId;
  currentStatus: LesionStatus;
  currentSeverity: number;
  currentEpisode: Episode | null;
  episodes: Episode[];
  /** Calendar days affected in the current (open) episode, 0 if none. */
  currentEpisodeDays: number;
  cumulativeDaysAffected: number;
  episodeCount: number;
  recurrenceCount: number;
  /** Mean of remission gaps; null when there has been no recurrence. */
  avgRemissionDays: number | null;
  /** Days since the last closure while the region is in remission; null otherwise. */
  daysInRemission: number | null;
  residualSkinNow: ResidualSkin[];
  firstLogDate: ISODate | null;
  lastLogDate: ISODate | null;
  daysSinceLastLog: number | null;
}

interface OpenEpisode {
  startDate: ISODate;
  index: number;
  remissionBeforeDays: number | null;
  obs: { date: ISODate; status: LesionStatus }[];
  peakSeverity: number;
  peakDate: ISODate;
  residualSkin: ResidualSkin[];
}

const byDate = (a: { date: ISODate }, b: { date: ISODate }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** Sort ascending, keep at most one log per date (the most recently updated wins), drop future logs. */
function prepare(logs: readonly BodyPartLog[], regionId: RegionId, asOf: ISODate): BodyPartLog[] {
  const latest = new Map<ISODate, BodyPartLog>();
  for (const l of logs) {
    if (l.regionId !== regionId || l.date > asOf) continue;
    const prev = latest.get(l.date);
    if (!prev || l.updatedAt >= prev.updatedAt) latest.set(l.date, l);
  }
  return [...latest.values()].sort(byDate);
}

function finalize(open: OpenEpisode, regionId: RegionId, endDate: ISODate | null, closedAs: 'healed' | 'clear' | null, asOf: ISODate): Episode {
  const endExclusive = endDate ?? addDaysISO(asOf, 1);
  let daysActive = 0;
  let daysHealing = 0;
  open.obs.forEach((o, i) => {
    const segEnd = open.obs[i + 1]?.date ?? endExclusive;
    const len = Math.max(0, diffDays(segEnd, o.date));
    if (o.status === 'active') daysActive += len;
    else daysHealing += len;
  });
  return {
    regionId,
    index: open.index,
    startDate: open.startDate,
    endDate,
    closedAs,
    daysAffected: daysActive + daysHealing,
    daysActive,
    daysHealing,
    peakSeverity: open.peakSeverity,
    peakDate: open.peakDate,
    isRecurrence: open.index > 1,
    remissionBeforeDays: open.remissionBeforeDays,
    residualSkin: open.residualSkin,
  };
}

export function deriveEpisodes(logs: readonly BodyPartLog[], regionId: RegionId, asOf: ISODate): Episode[] {
  const sorted = prepare(logs, regionId, asOf);
  const episodes: Episode[] = [];
  let open: OpenEpisode | null = null;
  let lastClosureDate: ISODate | null = null;

  for (const log of sorted) {
    if (open) {
      if (isAffectedStatus(log.status)) {
        open.obs.push({ date: log.date, status: log.status });
        if (log.severity > open.peakSeverity) {
          open.peakSeverity = log.severity;
          open.peakDate = log.date;
        }
        if (log.status === 'healing' && log.residualSkin.length > 0) open.residualSkin = [...log.residualSkin];
      } else {
        if (log.status === 'healed' && log.residualSkin.length > 0) open.residualSkin = [...log.residualSkin];
        episodes.push(finalize(open, regionId, log.date, log.status === 'healed' ? 'healed' : 'clear', asOf));
        lastClosureDate = log.date;
        open = null;
      }
    } else if (isAffectedStatus(log.status)) {
      open = {
        startDate: log.date,
        index: episodes.length + 1,
        remissionBeforeDays: lastClosureDate ? diffDays(log.date, lastClosureDate) : null,
        obs: [{ date: log.date, status: log.status }],
        peakSeverity: log.severity,
        peakDate: log.date,
        residualSkin: log.status === 'healing' ? [...log.residualSkin] : [],
      };
    } else if (log.status === 'healed' && log.residualSkin.length > 0 && episodes.length > 0) {
      // Later check-ups on a healed region refine the post-healing skin state of the last episode.
      (episodes[episodes.length - 1] as Episode).residualSkin = [...log.residualSkin];
    }
  }
  if (open) episodes.push(finalize(open, regionId, null, null, asOf));
  return episodes;
}

export function deriveRegionSummary(logs: readonly BodyPartLog[], regionId: RegionId, asOf: ISODate): RegionSummary {
  const sorted = prepare(logs, regionId, asOf);
  const episodes = deriveEpisodes(logs, regionId, asOf);
  const last = sorted[sorted.length - 1] ?? null;
  const currentEpisode = episodes.find((e) => e.endDate === null) ?? null;
  const closed = episodes.filter((e) => e.endDate !== null);
  const lastClosure = closed.length > 0 ? (closed[closed.length - 1] as Episode).endDate : null;
  const gaps = episodes.map((e) => e.remissionBeforeDays).filter((d): d is number => d !== null);
  const currentStatus = last?.status ?? 'clear';

  return {
    regionId,
    currentStatus,
    currentSeverity: last?.severity ?? 0,
    currentEpisode,
    episodes,
    currentEpisodeDays: currentEpisode?.daysAffected ?? 0,
    cumulativeDaysAffected: episodes.reduce((s, e) => s + e.daysAffected, 0),
    episodeCount: episodes.length,
    recurrenceCount: episodes.filter((e) => e.isRecurrence).length,
    avgRemissionDays: gaps.length > 0 ? gaps.reduce((s, d) => s + d, 0) / gaps.length : null,
    daysInRemission: !currentEpisode && lastClosure ? diffDays(asOf, lastClosure) : null,
    residualSkinNow: last && (last.status === 'healing' || last.status === 'healed') ? [...last.residualSkin] : [],
    firstLogDate: sorted[0]?.date ?? null,
    lastLogDate: last?.date ?? null,
    daysSinceLastLog: last ? diffDays(asOf, last.date) : null,
  };
}

export function deriveAllRegionSummaries(
  logs: readonly BodyPartLog[],
  asOf: ISODate,
): Record<RegionId, RegionSummary> {
  const out = {} as Record<RegionId, RegionSummary>;
  for (const id of REGION_IDS) out[id] = deriveRegionSummary(logs, id, asOf);
  return out;
}

export interface RegionDayState {
  /** null = never observed up to this day. Status is carried forward without limit. */
  status: LesionStatus | null;
  /**
   * Severity for analysis. `clear`/`healed` carry 0 indefinitely; `active`/`healing` severity is
   * carried forward for at most `maxCarryDays` and is null (unknown) after that.
   */
  severity: number | null;
}

export const DEFAULT_MAX_CARRY_DAYS = 7;

/** Per-day carried-forward state for one region over [from, to] (aligned with eachDayISO). */
export function regionDayStates(
  logs: readonly BodyPartLog[],
  regionId: RegionId,
  from: ISODate,
  to: ISODate,
  maxCarryDays: number = DEFAULT_MAX_CARRY_DAYS,
): RegionDayState[] {
  const sorted = prepare(logs, regionId, to);
  const days = eachDayISO(from, to);
  const out: RegionDayState[] = [];
  let idx = 0;
  let last: BodyPartLog | null = null;
  let lastOffset = 0; // day offset (relative to `from`) of `last`
  days.forEach((day, i) => {
    while (idx < sorted.length && (sorted[idx] as BodyPartLog).date <= day) {
      last = sorted[idx] as BodyPartLog;
      lastOffset = diffDays(last.date, from);
      idx++;
    }
    if (!last) {
      out.push({ status: null, severity: null });
      return;
    }
    const age = i - lastOffset;
    const severity = isAffectedStatus(last.status) ? (age <= maxCarryDays ? last.severity : null) : 0;
    out.push({ status: last.status, severity });
  });
  return out;
}

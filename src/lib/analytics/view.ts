/**
 * View-model helpers for the analytics page. Pure (no React, no i18n): URL state, range slicing,
 * and the numbers behind the charts. Text is composed in the UI layer.
 */
import { REGION_IDS, type RegionId } from '@/db/types';
import { addDaysISO, type ISODate } from '@/lib/date';
import type { DayFrame } from '@/lib/derive/frames';
import { LAG_IDS, SEVERITY_TIERS, type ForwardResult, type LagId, type LevelStats, type SeverityTier, type VariableId } from './types';

// ---------- URL state ----------

export const ANALYTICS_TABS = ['overview', 'forward', 'reverse'] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];

export const RANGE_PRESETS = ['30', '90', 'all'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const VARIABLE_IDS: readonly VariableId[] = [
  'bedding_days', 'sweat', 'shower_temp', 'stress', 'humidity', 'diet', 'temperature', 'sleep_hours', 'sleep_quality',
  'exercise_minutes', 'shower_minutes', 'cleansing', 'moisturizer', 'clothing', 'activity',
];

export interface AnalyticsParams {
  tab: AnalyticsTab;
  lag: LagId;
  range: RangePreset;
  variable: VariableId;
  tier: SeverityTier;
  region: RegionId | null;
  /** Exclude exposure days that were already in a flare. */
  onset: boolean;
}

export const DEFAULT_PARAMS: AnalyticsParams = { tab: 'overview', lag: 'T0', range: 'all', variable: 'bedding_days', tier: 'severe', region: null, onset: false };

const oneOf = <T extends string>(list: readonly T[], v: string | null, fallback: T): T => (v !== null && (list as readonly string[]).includes(v) ? (v as T) : fallback);

/** Every value is validated: a hand-edited or stale URL can never put the page in an impossible state. */
export function parseAnalyticsParams(sp: URLSearchParams): AnalyticsParams {
  const region = sp.get('region');
  return {
    tab: oneOf(ANALYTICS_TABS, sp.get('tab'), DEFAULT_PARAMS.tab),
    lag: oneOf(LAG_IDS, sp.get('lag'), DEFAULT_PARAMS.lag),
    range: oneOf(RANGE_PRESETS, sp.get('range'), DEFAULT_PARAMS.range),
    variable: oneOf(VARIABLE_IDS, sp.get('var'), DEFAULT_PARAMS.variable),
    tier: oneOf(SEVERITY_TIERS, sp.get('tier'), DEFAULT_PARAMS.tier),
    region: region !== null && (REGION_IDS as readonly string[]).includes(region) ? (region as RegionId) : null,
    onset: sp.get('onset') === '1',
  };
}

/** Only non-default values are written, so the default view has a clean URL. */
export function toSearchParams(p: AnalyticsParams): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.tab !== DEFAULT_PARAMS.tab) out.tab = p.tab;
  if (p.lag !== DEFAULT_PARAMS.lag) out.lag = p.lag;
  if (p.range !== DEFAULT_PARAMS.range) out.range = p.range;
  if (p.variable !== DEFAULT_PARAMS.variable) out.var = p.variable;
  if (p.tier !== DEFAULT_PARAMS.tier) out.tier = p.tier;
  if (p.region) out.region = p.region;
  if (p.onset) out.onset = '1';
  return out;
}

// ---------- range ----------

/** First day included for a preset ("last 30 days" = today and the 29 days before it). */
export function rangeStart(preset: RangePreset, today: ISODate): ISODate | null {
  return preset === 'all' ? null : addDaysISO(today, -(Number(preset) - 1));
}

export function sliceFrames(frames: readonly DayFrame[], from: ISODate | null): DayFrame[] {
  return from === null ? [...frames] : frames.filter((f) => f.date >= from);
}

// ---------- headline numbers ----------

export interface Headline {
  loggedDays: number;
  mean: number | null;
  flareDays: number;
  flareRate: number | null;
}

export function headline(frames: readonly DayFrame[], flareThreshold = 6): Headline {
  const sev = frames.map((f) => f.severity).filter((s): s is number => s !== null);
  const flares = sev.filter((s) => s >= flareThreshold).length;
  return {
    loggedDays: sev.length,
    mean: sev.length ? sev.reduce((a, b) => a + b, 0) / sev.length : null,
    flareDays: flares,
    flareRate: sev.length ? flares / sev.length : null,
  };
}

// ---------- forward explorer rows ----------

export interface ForwardRow {
  factorKey: string;
  level: LevelStats;
  n: number;
  mean: number | null;
  median: number | null;
  /** Flare probability in [0, 1]. */
  flareProb: number | null;
  /** n >= minBucketDays AND mean above the baseline mean (the spec's "exceeds baseline severity"). */
  exceedsMean: boolean;
  /** Same test on flare probability. */
  exceedsFlare: boolean;
}

export function forwardRows(result: ForwardResult, minBucketDays = 5): ForwardRow[] {
  const baseFlare = result.baseline.flareProb;
  return result.levels.map((level) => ({
    factorKey: level.factorKey,
    level,
    n: level.n,
    mean: level.mean,
    median: level.median,
    flareProb: level.flareProb,
    exceedsMean: level.exceedsBaseline,
    exceedsFlare: level.n >= minBucketDays && level.flareProb !== null && baseFlare !== null && level.flareProb > baseFlare,
  }));
}

// ---------- spread glyph (box + whiskers) ----------

export interface BoxGeometry {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

/** Positions (0..width) of min / Q1 / median / Q3 / max on a fixed domain; null when the level is empty. */
export function boxGeometry(level: Pick<LevelStats, 'min' | 'q1' | 'median' | 'q3' | 'max' | 'n'>, domain: readonly [number, number], width: number): BoxGeometry | null {
  if (level.n === 0 || level.min === null || level.q1 === null || level.median === null || level.q3 === null || level.max === null) return null;
  const [lo, hi] = domain;
  const x = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * width;
  return { min: x(level.min), q1: x(level.q1), median: x(level.median), q3: x(level.q3), max: x(level.max) };
}

/** Horizontal position (0..1) on a bar scale. */
export const scale01 = (value: number, max: number): number => (max <= 0 ? 0 : Math.min(1, Math.max(0, value / max)));

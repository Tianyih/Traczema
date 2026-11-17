/**
 * Engine types. The engine emits ONLY ids, numbers and i18n key *names* (`labelKey`) — never
 * display text. The UI resolves labels through `t()`; `src/i18n` is never imported from here.
 */
import type { CustomRef, RegionId } from '@/db/types';
import type { ISODate } from '@/lib/date';
import type { DayFrame } from '@/lib/derive/frames';

export const LAG_IDS = ['T0', 'T1', 'T2', 'W48'] as const;
export type LagId = (typeof LAG_IDS)[number];

export const SEVERITY_TIERS = ['mild', 'moderate', 'severe'] as const;
export type SeverityTier = (typeof SEVERITY_TIERS)[number];

/** A day is a "flare" when its (lag-aligned) severity is at least this. */
export const FLARE_THRESHOLD = 6;

export const TIER_RANGES: Record<SeverityTier, { min: number; max: number }> = {
  mild: { min: 1, max: 3 },
  moderate: { min: 4, max: 6 },
  severe: { min: 7, max: 10 },
};

export const tierOf = (severity: number): SeverityTier | null => {
  for (const t of SEVERITY_TIERS) {
    if (severity >= TIER_RANGES[t].min && severity <= TIER_RANGES[t].max) return t;
  }
  return null; // severity 0 ("none") belongs to no tier
};

export const isFlare = (severity: number): boolean => severity >= FLARE_THRESHOLD;

export type VariableId =
  | 'temperature'
  | 'humidity'
  | 'stress'
  | 'sleep_hours'
  | 'sleep_quality'
  | 'exercise_minutes'
  | 'shower_minutes'
  | 'bedding_days'
  | 'diet'
  | 'clothing'
  | 'activity'
  | 'sweat'
  | 'shower_temp'
  | 'cleansing'
  | 'moisturizer';

export type VariableGroup = 'diet' | 'weather' | 'exercise' | 'shower' | 'clothing' | 'bedding' | 'stress_sleep';

export type Unit = 'celsius' | 'percent' | 'minutes' | 'hours' | 'days' | 'score';

export interface AnalysisOptions {
  lag: LagId;
  /** When set, the outcome is that region's carried-forward severity instead of overall severity. */
  regionId: RegionId | null;
  /** Inclusive bounds on the EXPOSURE day. */
  from: ISODate | null;
  to: ISODate | null;
  /** Fewer target-tier days than this => results are flagged "insufficient". */
  minTierDays: number;
  /** A factor must be present on at least this many days (and absent on this many). */
  minFactorSupport: number;
  /** Forward explorer: minimum days in a bucket to highlight it. */
  minBucketDays: number;
  /** Exclude exposure days that were already in flare (isolates NEW flares from persistence). */
  onsetOnly: boolean;
}

export const DEFAULT_OPTIONS: AnalysisOptions = {
  lag: 'T0',
  regionId: null,
  from: null,
  to: null,
  minTierDays: 5,
  minFactorSupport: 3,
  minBucketDays: 5,
  onsetOnly: false,
};

export const resolveOptions = (o: Partial<AnalysisOptions> = {}): AnalysisOptions => ({ ...DEFAULT_OPTIONS, ...o });

/** Fewer aligned days than this triggers the small-sample warning. */
export const RECOMMENDED_MIN_DAYS = 30;

export interface AlignedDay {
  /** Exposure day. */
  date: ISODate;
  exposure: DayFrame;
  /** Lag-window outcome severity (max over the window's known days). */
  outcome: number;
}

/** How a factor's value should be rendered. Text is composed in the UI. */
export type FactorValue =
  | { kind: 'key'; labelKey: string }
  | { kind: 'range'; min: number | null; max: number | null; unit: Unit; integer: boolean }
  | { kind: 'custom'; ref: CustomRef };

/** One binary predicate over a day: 1 present, 0 absent, null unknown (excluded). */
export interface FactorDef {
  key: string;
  variableId: VariableId | 'composite';
  variableLabelKey: string;
  value: FactorValue;
  evaluate: (frame: DayFrame) => 1 | 0 | null;
}

export type AnalysisWarning =
  | { code: 'no_data' }
  | { code: 'small_sample'; params: { n: number; min: number } }
  | { code: 'few_tier_days'; params: { tierDays: number; min: number } }
  | { code: 'low_coverage'; params: { known: number; total: number } };

export type Evidence = 'strong' | 'moderate' | 'weak' | 'insufficient';

export interface FactorResult {
  factorKey: string;
  variableId: FactorDef['variableId'];
  variableLabelKey: string;
  value: FactorValue;
  counts: {
    /** Aligned days where this factor's exposure is known. */
    N: number;
    /** Of those, days in the target set (tier / flare). */
    targetDays: number;
    /** Days the factor is present. */
    factorDays: number;
    /** Days the factor is present AND in the target set. */
    both: number;
  };
  /** both / targetDays — "present on X% of target days". */
  coOccurrenceRate: number;
  /** factorDays / N — "present on Y% of all days". */
  baselineRate: number;
  /** coOccurrenceRate / baselineRate. */
  lift: number;
  /** Phi coefficient of the 2x2 (factor × target), in [-1, 1]. */
  phi: number;
  /** P(target | present) / P(target | absent); null if undefined. */
  relativeRisk: number | null;
  /** One-sided Fisher exact (enrichment). */
  pValue: number;
  /** Benjamini–Hochberg q over all testable factors; null when insufficient. */
  qValue: number | null;
  evidence: Evidence;
  direction: 'risk' | 'protective' | 'neutral';
}

export type ScanTarget = { kind: 'tier'; tier: SeverityTier } | { kind: 'flare' };

export interface ScanResult {
  target: ScanTarget;
  lag: LagId;
  regionId: RegionId | null;
  /** Aligned days overall, and how many fall in the target set. */
  N: number;
  targetDays: number;
  /** lift > 1 and enough support, best first. */
  ranked: FactorResult[];
  /** lift <= 1 and enough support ("less common on these days"). */
  protective: FactorResult[];
  /** Too little data to rank. */
  insufficient: FactorResult[];
  warnings: AnalysisWarning[];
}

export interface LevelStats {
  factorKey: string;
  value: FactorValue;
  n: number;
  mean: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
  flareCount: number;
  flareProb: number | null;
  flareCI: [number, number] | null;
  deltaMean: number | null;
  /** n >= minBucketDays AND mean > baseline mean. */
  exceedsBaseline: boolean;
  /** One-sided Fisher p (level vs rest, flare vs not) and BH q within the variable. */
  p: number | null;
  q: number | null;
}

export interface ForwardResult {
  variableId: VariableId;
  variableLabelKey: string;
  lag: LagId;
  regionId: RegionId | null;
  baseline: { n: number; mean: number | null; median: number | null; flareProb: number | null };
  levels: LevelStats[];
  /** Monotone trend (continuous / ordinal variables only). */
  trend: { rho: number; p: number; n: number } | null;
  warnings: AnalysisWarning[];
}

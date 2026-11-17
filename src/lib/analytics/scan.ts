/**
 * Factor scanning — the core of the Reverse Explorer and the Ranked Trigger Impact overview.
 *
 * For a factor f and a target set T (a severity tier, or "flare") over the aligned days where f's
 * exposure is known:
 *
 *   N  = aligned days with f known          m = days f present
 *   NT = days in T                          a = days f present AND in T
 *
 *   coOccurrence = a / NT        ("present on X% of target days")
 *   baseline     = m / N         ("present on Y% of all days")
 *   lift         = coOccurrence / baseline    (= P(T|f) / P(T))
 *   phi          = (ad − bc) / sqrt((a+b)(c+d)(a+c)(b+d))
 *   p            = P(X >= a),  X ~ Hypergeometric(N, m, NT)      one-sided Fisher exact
 *   q            = Benjamini–Hochberg over every testable factor
 */
import {
  type AlignedDay,
  type AnalysisOptions,
  type AnalysisWarning,
  type Evidence,
  type FactorDef,
  type FactorResult,
  type ScanResult,
  type ScanTarget,
  type SeverityTier,
  RECOMMENDED_MIN_DAYS,
  TIER_RANGES,
  isFlare,
  resolveOptions,
} from './types';
import { benjaminiHochberg, fisherExactGreater, phi } from './stats';

export type TargetPredicate = (outcome: number) => boolean;

export const tierPredicate =
  (tier: SeverityTier): TargetPredicate =>
  (y) =>
    y >= TIER_RANGES[tier].min && y <= TIER_RANGES[tier].max;

export function scanFactors(
  aligned: readonly AlignedDay[],
  factors: readonly FactorDef[],
  isTarget: TargetPredicate,
  partial: Partial<AnalysisOptions> = {},
): FactorResult[] {
  const o = resolveOptions(partial);
  const results: FactorResult[] = [];

  for (const factor of factors) {
    let a = 0; // present & target
    let b = 0; // present & not target
    let c = 0; // absent & target
    let d = 0; // absent & not target
    for (const day of aligned) {
      const present = factor.evaluate(day.exposure);
      if (present === null) continue;
      const target = isTarget(day.outcome);
      if (present === 1) target ? a++ : b++;
      else target ? c++ : d++;
    }
    const N = a + b + c + d;
    const m = a + b;
    const NT = a + c;
    if (N === 0 || m === 0) continue; // never present (or never observed): nothing to say

    const coOccurrenceRate = NT > 0 ? a / NT : 0;
    const baselineRate = m / N;
    const lift = coOccurrenceRate / baselineRate;
    const insufficient = m < o.minFactorSupport || N - m < o.minFactorSupport || NT < o.minTierDays;

    results.push({
      factorKey: factor.key,
      variableId: factor.variableId,
      variableLabelKey: factor.variableLabelKey,
      value: factor.value,
      counts: { N, targetDays: NT, factorDays: m, both: a },
      coOccurrenceRate,
      baselineRate,
      lift,
      phi: phi(a, b, c, d),
      relativeRisk: N - m > 0 && c > 0 ? a / m / (c / (N - m)) : null,
      pValue: fisherExactGreater(a, b, c, d),
      qValue: null,
      evidence: insufficient ? 'insufficient' : 'weak',
      direction: lift > 1 ? 'risk' : lift < 1 ? 'protective' : 'neutral',
    });
  }

  // BH correction over the family of factors that were actually testable.
  const testable = results.filter((r) => r.evidence !== 'insufficient');
  const q = benjaminiHochberg(testable.map((r) => r.pValue));
  testable.forEach((r, i) => {
    r.qValue = q[i] as number;
    r.evidence = gradeEvidence(r);
  });
  return results;
}

function gradeEvidence(r: FactorResult): Evidence {
  if (r.direction !== 'risk') return 'weak';
  if ((r.qValue ?? 1) < 0.05 && r.counts.both >= 5) return 'strong';
  if (r.pValue < 0.05 && r.counts.both >= 3) return 'moderate';
  return 'weak';
}

const byStrength = (x: FactorResult, y: FactorResult): number =>
  y.lift - x.lift ||
  y.phi - x.phi ||
  y.counts.factorDays - x.counts.factorDays ||
  (x.factorKey < y.factorKey ? -1 : x.factorKey > y.factorKey ? 1 : 0);

export function groupAndRank(results: readonly FactorResult[]): Pick<ScanResult, 'ranked' | 'protective' | 'insufficient'> {
  const ranked: FactorResult[] = [];
  const protective: FactorResult[] = [];
  const insufficient: FactorResult[] = [];
  for (const r of results) {
    if (r.evidence === 'insufficient') insufficient.push(r);
    else if (r.direction === 'risk') ranked.push(r);
    else protective.push(r);
  }
  ranked.sort(byStrength);
  protective.sort((x, y) => x.lift - y.lift || (x.factorKey < y.factorKey ? -1 : 1));
  insufficient.sort(byStrength);
  return { ranked, protective, insufficient };
}

function runScan(
  aligned: readonly AlignedDay[],
  factors: readonly FactorDef[],
  target: ScanTarget,
  isTarget: TargetPredicate,
  partial: Partial<AnalysisOptions>,
): ScanResult {
  const o = resolveOptions(partial);
  const targetDays = aligned.filter((d) => isTarget(d.outcome)).length;
  const warnings: AnalysisWarning[] = [];
  if (aligned.length === 0) warnings.push({ code: 'no_data' });
  else {
    if (aligned.length < RECOMMENDED_MIN_DAYS) {
      warnings.push({ code: 'small_sample', params: { n: aligned.length, min: RECOMMENDED_MIN_DAYS } });
    }
    if (targetDays < o.minTierDays) {
      warnings.push({ code: 'few_tier_days', params: { tierDays: targetDays, min: o.minTierDays } });
    }
  }
  return {
    target,
    lag: o.lag,
    regionId: o.regionId,
    N: aligned.length,
    targetDays,
    ...groupAndRank(scanFactors(aligned, factors, isTarget, o)),
    warnings,
  };
}

/** Reverse Explorer: which factors are over-represented on days in the chosen severity tier? */
export function reverseAnalysis(
  aligned: readonly AlignedDay[],
  factors: readonly FactorDef[],
  tier: SeverityTier,
  partial: Partial<AnalysisOptions> = {},
): ScanResult {
  return runScan(aligned, factors, { kind: 'tier', tier }, tierPredicate(tier), partial);
}

/** Ranked Trigger Impact overview: the same scan with "flare" (severity >= 6) as the target. */
export function rankTriggerImpact(
  aligned: readonly AlignedDay[],
  factors: readonly FactorDef[],
  partial: Partial<AnalysisOptions> = {},
): ScanResult {
  return runScan(aligned, factors, { kind: 'flare' }, isFlare, partial);
}

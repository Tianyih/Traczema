/**
 * Forward Explorer: for one variable, compare the (lag-aligned) severity across its
 * buckets / categories against the baseline of all days where the variable is known.
 */
import {
  type AlignedDay,
  type AnalysisOptions,
  type AnalysisWarning,
  type ForwardResult,
  type LevelStats,
  RECOMMENDED_MIN_DAYS,
  isFlare,
  resolveOptions,
} from './types';
import {
  benjaminiHochberg,
  fisherExactGreater,
  mean,
  median,
  quantile,
  spearmanTest,
  wilsonInterval,
} from './stats';
import { type Variable, factorsForVariable, numericValue } from './variables';

export function forwardAnalysis(
  aligned: readonly AlignedDay[],
  variable: Variable,
  partial: Partial<AnalysisOptions> = {},
): ForwardResult {
  const o = resolveOptions(partial);
  const factors = factorsForVariable(variable);

  // Days on which this variable is known at all (any level evaluates to 0/1).
  const known = aligned.filter((d) => factors.some((f) => f.evaluate(d.exposure) !== null));
  const outcomes = known.map((d) => d.outcome);
  const baseMean = known.length > 0 ? mean(outcomes) : null;
  const baseFlare = known.length > 0 ? outcomes.filter(isFlare).length / known.length : null;

  const levels: LevelStats[] = factors.map((f) => {
    const inLevel: number[] = [];
    let restFlare = 0;
    let restNonFlare = 0;
    for (const d of known) {
      const v = f.evaluate(d.exposure);
      if (v === 1) inLevel.push(d.outcome);
      else if (v === 0) (isFlare(d.outcome) ? restFlare++ : restNonFlare++);
    }
    const n = inLevel.length;
    const flareCount = inLevel.filter(isFlare).length;
    const lvlMean = n > 0 ? mean(inLevel) : null;
    return {
      factorKey: f.key,
      value: f.value,
      n,
      mean: lvlMean,
      median: n > 0 ? median(inLevel) : null,
      q1: n > 0 ? quantile(inLevel, 0.25) : null,
      q3: n > 0 ? quantile(inLevel, 0.75) : null,
      min: n > 0 ? Math.min(...inLevel) : null,
      max: n > 0 ? Math.max(...inLevel) : null,
      flareCount,
      flareProb: n > 0 ? flareCount / n : null,
      flareCI: n > 0 ? wilsonInterval(flareCount, n) : null,
      deltaMean: lvlMean !== null && baseMean !== null ? lvlMean - baseMean : null,
      exceedsBaseline: n >= o.minBucketDays && lvlMean !== null && baseMean !== null && lvlMean > baseMean,
      p: n > 0 ? fisherExactGreater(flareCount, n - flareCount, restFlare, restNonFlare) : null,
      q: null,
    };
  });

  // BH within the variable, over levels that have observations.
  const tested = levels.filter((l) => l.p !== null);
  const q = benjaminiHochberg(tested.map((l) => l.p as number));
  tested.forEach((l, i) => {
    l.q = q[i] as number;
  });

  // Monotone trend for continuous / ordinal variables.
  let trend: ForwardResult['trend'] = null;
  if (variable.kind === 'continuous' || variable.kind === 'ordinal') {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const d of aligned) {
      const x = numericValue(variable, d.exposure);
      if (x !== null) {
        xs.push(x);
        ys.push(d.outcome);
      }
    }
    const t = spearmanTest(xs, ys);
    if (t) trend = { rho: t.rho, p: t.p, n: t.n };
  }

  const warnings: AnalysisWarning[] = [];
  if (known.length === 0) warnings.push({ code: 'no_data' });
  else {
    if (known.length < RECOMMENDED_MIN_DAYS) {
      warnings.push({ code: 'small_sample', params: { n: known.length, min: RECOMMENDED_MIN_DAYS } });
    }
    if (known.length < aligned.length) {
      warnings.push({ code: 'low_coverage', params: { known: known.length, total: aligned.length } });
    }
  }

  return {
    variableId: variable.id,
    variableLabelKey: variable.labelKey,
    lag: o.lag,
    regionId: o.regionId,
    baseline: {
      n: known.length,
      mean: baseMean,
      median: known.length > 0 ? median(outcomes) : null,
      flareProb: baseFlare,
    },
    levels,
    trend,
    warnings,
  };
}

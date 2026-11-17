/**
 * Pure statistical primitives. No dependencies, deterministic, fully unit-tested.
 * Empty inputs return NaN (callers guard with n > 0).
 */

export const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);

export const mean = (xs: readonly number[]): number => (xs.length === 0 ? NaN : sum(xs) / xs.length);

/** Quantile with linear interpolation (R type 7 / NumPy default). `p` in [0, 1]. */
export function quantile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return (s[lo] as number) + (h - lo) * ((s[hi] as number) - (s[lo] as number));
}

export const median = (xs: readonly number[]): number => quantile(xs, 0.5);

export interface BoxStats {
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  /** Tukey whiskers: most extreme points within 1.5·IQR of the quartiles. */
  whiskerLow: number;
  whiskerHigh: number;
  outliers: number[];
}

export function boxStats(xs: readonly number[]): BoxStats | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  const inside = s.filter((x) => x >= loFence && x <= hiFence);
  return {
    n: s.length,
    min: s[0] as number,
    q1,
    median: quantile(s, 0.5),
    q3,
    max: s[s.length - 1] as number,
    whiskerLow: inside[0] as number,
    whiskerHigh: inside[inside.length - 1] as number,
    outliers: s.filter((x) => x < loFence || x > hiFence),
  };
}

/** Wilson score interval for a binomial proportion (default 95%). */
export function wilsonInterval(successes: number, n: number, z = 1.959963984540054): [number, number] {
  if (n <= 0) return [0, 1];
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

// ---------- Fisher exact (one-sided) ----------

const logFactTable: number[] = [0];
function logFactorial(n: number): number {
  for (let i = logFactTable.length; i <= n; i++) {
    logFactTable[i] = (logFactTable[i - 1] as number) + Math.log(i);
  }
  return logFactTable[n] as number;
}
const logChoose = (n: number, k: number): number =>
  k < 0 || k > n ? -Infinity : logFactorial(n) - logFactorial(k) - logFactorial(n - k);

/**
 * One-sided (enrichment) Fisher exact test for the 2x2 table
 *
 *              target   not target
 *   present      a         b
 *   absent       c         d
 *
 * Returns P(X >= a) where X ~ Hypergeometric(N = a+b+c+d, m = a+b, K = a+c).
 */
export function fisherExactGreater(a: number, b: number, c: number, d: number): number {
  if ([a, b, c, d].some((v) => !Number.isInteger(v) || v < 0)) {
    throw new RangeError('fisherExactGreater expects non-negative integer counts');
  }
  const N = a + b + c + d;
  const m = a + b;
  const K = a + c;
  if (N === 0) return 1;
  const logDenom = logChoose(N, K);
  let p = 0;
  for (let x = a; x <= Math.min(m, K); x++) {
    p += Math.exp(logChoose(m, x) + logChoose(N - m, K - x) - logDenom);
  }
  return Math.min(1, p);
}

// ---------- Association measures ----------

/** Phi coefficient of a 2x2 table (Pearson correlation of two binary variables). 0 if undefined. */
export function phi(a: number, b: number, c: number, d: number): number {
  const denom = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
  return denom === 0 ? 0 : (a * d - b * c) / denom;
}

/** Benjamini–Hochberg adjusted p-values (q-values), returned in the input order. */
export function benjaminiHochberg(pValues: readonly number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];
  const order = pValues.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const q = new Array<number>(m);
  let running = 1;
  for (let r = m - 1; r >= 0; r--) {
    const { p, i } = order[r] as { p: number; i: number };
    running = Math.min(running, (p * m) / (r + 1));
    q[i] = Math.min(1, running);
  }
  return q;
}

// ---------- Rank correlation ----------

/** 1-based ranks; ties receive the average of the ranks they span. */
export function averageRanks(xs: readonly number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const ranks = new Array<number>(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && (order[j + 1] as { x: number }).x === (order[i] as { x: number }).x) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[(order[k] as { i: number }).i] = avg;
    i = j + 1;
  }
  return ranks;
}

export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n !== y.length || n < 2) return NaN;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] as number) - mx;
    const dy = (y[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  return denom === 0 ? NaN : sxy / denom;
}

export const spearman = (x: readonly number[], y: readonly number[]): number =>
  pearson(averageRanks(x), averageRanks(y));

/** Complementary error function (Numerical Recipes erfcc, fractional error < 1.2e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? ans : 2 - ans;
}

export const normalCdf = (z: number): number => 0.5 * erfc(-z / Math.SQRT2);

export interface SpearmanResult {
  rho: number;
  n: number;
  /** Two-sided p via the Fisher z-transform with the Fieller variance 1.06/(n−3). */
  p: number;
}

/** Spearman correlation with a normal-approximation p-value. Needs n >= 4 and non-constant inputs. */
export function spearmanTest(x: readonly number[], y: readonly number[]): SpearmanResult | null {
  const n = x.length;
  if (n < 4 || n !== y.length) return null;
  const rho = spearman(x, y);
  if (Number.isNaN(rho)) return null;
  const clamped = Math.max(-1 + 1e-12, Math.min(1 - 1e-12, rho));
  const z = Math.atanh(clamped) * Math.sqrt((n - 3) / 1.06);
  return { rho, n, p: Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))) };
}

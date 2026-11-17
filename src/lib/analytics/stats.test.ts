import { describe, expect, it } from 'vitest';
import {
  averageRanks,
  benjaminiHochberg,
  boxStats,
  erfc,
  fisherExactGreater,
  mean,
  median,
  normalCdf,
  phi,
  quantile,
  spearman,
  spearmanTest,
  wilsonInterval,
} from './stats';

describe('descriptive stats', () => {
  it('mean / median / quantile (R-7)', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    // R: quantile(c(1,2,3,4,5,6,7,8,9,10), c(.25,.75)) -> 3.25, 7.75
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(xs, 0.25)).toBeCloseTo(3.25, 10);
    expect(quantile(xs, 0.75)).toBeCloseTo(7.75, 10);
    expect(Number.isNaN(mean([]))).toBe(true);
  });

  it('box stats with Tukey whiskers and outliers', () => {
    const b = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    expect(b).not.toBeNull();
    expect(b?.median).toBe(5.5);
    expect(b?.outliers).toEqual([100]);
    expect(b?.whiskerHigh).toBe(9);
    expect(boxStats([])).toBeNull();
  });
});

describe('wilsonInterval', () => {
  it('matches the published 8/10 interval (0.490, 0.943)', () => {
    const [lo, hi] = wilsonInterval(8, 10);
    expect(lo).toBeCloseTo(0.4902, 3);
    expect(hi).toBeCloseTo(0.9433, 3);
  });
  it('is bounded in [0,1] at the extremes and uninformative at n=0', () => {
    expect(wilsonInterval(0, 10)[0]).toBe(0);
    expect(wilsonInterval(10, 10)[1]).toBeCloseTo(1, 12);
    expect(wilsonInterval(0, 0)).toEqual([0, 1]);
  });
});

describe('fisherExactGreater', () => {
  it('lady-tasting-tea table [[3,1],[1,3]] -> 17/70', () => {
    expect(fisherExactGreater(3, 1, 1, 3)).toBeCloseTo(17 / 70, 12);
  });
  it('perfect separation [[5,0],[0,5]] -> 1/252', () => {
    expect(fisherExactGreater(5, 0, 0, 5)).toBeCloseTo(1 / 252, 12);
  });
  it('no association gives p near 0.5+, and a=0 gives 1', () => {
    expect(fisherExactGreater(0, 5, 5, 0)).toBeCloseTo(1, 12);
    expect(fisherExactGreater(5, 5, 5, 5)).toBeGreaterThan(0.5);
  });
  it('R reference: fisher.test(matrix(c(10,4,3,13),2), alternative="greater") ~ 0.0113', () => {
    // table rows (present: 10,3 | absent: 4,13) -> a=10,b=3,c=4,d=13 ... computed by exact sum
    const p = fisherExactGreater(10, 3, 4, 13);
    let expected = 0;
    const C = (n: number, k: number) => {
      let r = 1;
      for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
      return r;
    };
    for (let x = 10; x <= 13; x++) expected += (C(13, x) * C(17, 14 - x)) / C(30, 14);
    expect(p).toBeCloseTo(expected, 10);
  });
  it('rejects negative / non-integer counts', () => {
    expect(() => fisherExactGreater(-1, 0, 0, 0)).toThrow(RangeError);
    expect(() => fisherExactGreater(1.5, 0, 0, 0)).toThrow(RangeError);
  });
});

describe('phi', () => {
  it('perfect association = 1, perfect inverse = -1, independence = 0', () => {
    expect(phi(5, 0, 0, 5)).toBeCloseTo(1, 12);
    expect(phi(0, 5, 5, 0)).toBeCloseTo(-1, 12);
    expect(phi(5, 5, 5, 5)).toBeCloseTo(0, 12);
  });
  it('is 0 when a margin is empty', () => {
    expect(phi(0, 0, 3, 4)).toBe(0);
  });
});

describe('benjaminiHochberg', () => {
  it('matches the hand-computed example', () => {
    // sorted: .005 .01 .03 .04 -> .02 .02 .04 .04
    const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.005]);
    [0.02, 0.04, 0.04, 0.02].forEach((v, i) => expect(q[i]).toBeCloseTo(v, 12));
  });
  it('is monotone, capped at 1, and handles empty input', () => {
    const q = benjaminiHochberg([0.9, 0.8, 0.95]);
    expect(Math.max(...q)).toBeLessThanOrEqual(1);
    expect(benjaminiHochberg([])).toEqual([]);
    expect(benjaminiHochberg([0.5])).toEqual([0.5]);
  });
});

describe('rank correlation', () => {
  it('average ranks for ties', () => {
    expect(averageRanks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });
  it('spearman matches hand computation 8/sqrt(95)', () => {
    expect(spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 7])).toBeCloseTo(8 / Math.sqrt(95), 10);
  });
  it('perfect monotone relation (non-linear) = 1; reversed = -1', () => {
    expect(spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4, 5], [9, 7, 5, 3, 1])).toBeCloseTo(-1, 12);
  });
  it('spearmanTest needs n>=4 and non-constant data', () => {
    expect(spearmanTest([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(spearmanTest([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
    const r = spearmanTest([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r?.rho).toBeCloseTo(1, 10);
    expect(r?.p).toBeLessThan(1e-6);
    const weak = spearmanTest([1, 2, 3, 4, 5, 6, 7, 8], [3, 1, 4, 2, 6, 5, 8, 7]);
    expect(weak?.p).toBeGreaterThan(0);
    expect(weak?.p).toBeLessThan(0.05);
  });
});

describe('normal distribution', () => {
  it('erfc / normalCdf reference values', () => {
    expect(erfc(0)).toBeCloseTo(1, 6);
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 5);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 5);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 5);
  });
});

/** Small deterministic PRNG (mulberry32) so mock data is reproducible from a seed. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal (Box–Muller). */
  normal(mean?: number, sd?: number): number;
  chance(p: number): boolean;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (mean = 0, sd = 1): number => {
    const u = 1 - next(); // (0, 1]
    const v = next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return {
    next,
    normal,
    chance: (p) => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (items) => items[Math.floor(next() * items.length)] as never,
    shuffle: (items) => {
      const arr = [...items];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j] as never, arr[i] as never];
      }
      return arr;
    },
  };
}

/** FNV-1a 32-bit hash of a string, hex encoded. Used for golden-output checks. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

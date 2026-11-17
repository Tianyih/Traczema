import { describe, expect, it } from 'vitest';
import { REGION_IDS } from '@/db/types';
import { ALL_REGIONS, type BodyView } from '@/lib/regions';
import { BODY_SHAPES, COORD_SPACE, MIRROR_TRANSFORM, VIEWBOX } from './bodyMapShapes';

const VIEWS: BodyView[] = ['anterior', 'posterior'];
const numbers = (d: string) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

describe('body map geometry', () => {
  it('draws exactly the regions REGION_META says exist in each view (once each)', () => {
    for (const view of VIEWS) {
      const drawn = BODY_SHAPES[view].shapes.map((s) => s.region).sort();
      const expected = ALL_REGIONS.filter((r) => r.views.includes(view)).map((r) => r.id).sort();
      expect(drawn, view).toEqual(expected);
      expect(new Set(drawn).size).toBe(drawn.length);
    }
  });

  it('every one of the 15 tracked regions can be clicked in at least one view', () => {
    const covered = new Set(VIEWS.flatMap((v) => BODY_SHAPES[v].shapes.map((s) => s.region)));
    expect([...covered].sort()).toEqual([...REGION_IDS].sort());
  });

  it('uses only absolute M / L / C / Z commands in well-formed, closed paths', () => {
    const all = VIEWS.flatMap((v) => [...BODY_SHAPES[v].shapes.map((s) => s.d), ...BODY_SHAPES[v].silhouette.map((s) => s.d)]);
    for (const d of all) {
      expect(d.trim().startsWith('M')).toBe(true);
      expect(d.trim().endsWith('Z')).toBe(true);
      expect(d.replace(/[MLCZ\d\s.-]/g, ''), d).toBe(''); // no relative / arc / other commands
    }
  });

  it('keeps every coordinate (and its mirror image) inside the coordinate space', () => {
    for (const view of VIEWS) {
      for (const s of [...BODY_SHAPES[view].shapes, ...BODY_SHAPES[view].silhouette]) {
        const n = numbers(s.d);
        expect(n.length % 2).toBe(0);
        for (let i = 0; i < n.length; i += 2) {
          const x = n[i] as number;
          const y = n[i + 1] as number;
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(COORD_SPACE.width);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(COORD_SPACE.height);
          if (s.mirrored) expect(COORD_SPACE.width - x).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('the cropped viewBox still contains the whole body (both limbs) with a margin, and is centred', () => {
    const xs = VIEWS.flatMap((v) => BODY_SHAPES[v].shapes.flatMap((s) => {
      const px = numbers(s.d).filter((_, i) => i % 2 === 0);
      return s.mirrored ? [...px, ...px.map((x) => COORD_SPACE.width - x)] : px;
    }));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(VIEWBOX.x + 4);
    expect(Math.max(...xs)).toBeLessThanOrEqual(VIEWBOX.x + VIEWBOX.width - 4);
    expect(VIEWBOX.x * 2 + VIEWBOX.width).toBe(COORD_SPACE.width); // centred on x = 110
    expect(MIRROR_TRANSFORM).toBe('translate(220 0) scale(-1 1)');
  });

  it('side regions are authored on the right half only (so the mirror lands on the left)', () => {
    for (const view of VIEWS) {
      for (const s of BODY_SHAPES[view].shapes.filter((x) => x.mirrored)) {
        const xs = numbers(s.d).filter((_, i) => i % 2 === 0);
        expect(Math.min(...xs), `${view}/${s.region}`).toBeGreaterThanOrEqual(110);
      }
    }
  });

  it('centred regions are symmetric about x = 110', () => {
    for (const view of VIEWS) {
      for (const s of BODY_SHAPES[view].shapes.filter((x) => !x.mirrored)) {
        const xs = numbers(s.d).filter((_, i) => i % 2 === 0);
        expect(Math.min(...xs) + Math.max(...xs), `${view}/${s.region}`).toBe(220);
      }
    }
  });

  it('every region is big enough to click or tap (bounding box >= 10 units each way)', () => {
    for (const view of VIEWS) {
      for (const s of BODY_SHAPES[view].shapes) {
        const n = numbers(s.d);
        const xs = n.filter((_, i) => i % 2 === 0);
        const ys = n.filter((_, i) => i % 2 === 1);
        expect(Math.max(...xs) - Math.min(...xs), `${view}/${s.region} width`).toBeGreaterThanOrEqual(10);
        expect(Math.max(...ys) - Math.min(...ys), `${view}/${s.region} height`).toBeGreaterThanOrEqual(10);
      }
    }
  });
});

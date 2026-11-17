import { describe, expect, it } from 'vitest';
import { contrastRatio, HEAT_INK, heatGradient, oklchToRgb, severityColor, severityRgb } from './heat';

const ink: [number, number, number] = [0x17, 0x17, 0x17];
const dominant = ([r, g, b]: [number, number, number]) => (r > g && r > b ? 'red' : g > r && g > b ? 'green' : 'other');

describe('severity heat scale', () => {
  it('is green at 0 and red at 10, passing through yellow/orange', () => {
    expect(dominant(severityRgb(0))).toBe('green');
    expect(dominant(severityRgb(10))).toBe('red');
    const mid = severityRgb(5);
    expect(mid[0]).toBeGreaterThan(150); // warm: strong red channel...
    expect(mid[1]).toBeGreaterThan(150); // ...and strong green channel = yellow
    expect(mid[2]).toBeLessThan(mid[0]);
  });

  it('red rises and green falls monotonically from 5 to 10 (no hue reversals)', () => {
    let prevG = 999;
    for (let s = 5; s <= 10; s += 0.5) {
      const [, g] = severityRgb(s);
      expect(g).toBeLessThanOrEqual(prevG);
      prevG = g;
    }
  });

  it('dark ink text meets WCAG AA (>= 4.5:1) on every step of the scale', () => {
    for (let s = 0; s <= 10; s += 0.25) {
      expect(contrastRatio(ink, severityRgb(s)), `severity ${s}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(HEAT_INK).toBe('#171717');
  });

  it('adjacent integer severities are visibly distinct', () => {
    for (let s = 0; s < 10; s++) {
      const a = severityRgb(s);
      const b = severityRgb(s + 1);
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      expect(dist, `${s}->${s + 1}`).toBeGreaterThan(12);
    }
  });

  it('clamps out-of-range input and returns valid hex', () => {
    expect(severityColor(-5)).toBe(severityColor(0));
    expect(severityColor(99)).toBe(severityColor(10));
    for (let s = 0; s <= 10; s++) expect(severityColor(s)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('oklab sanity: white and black convert correctly', () => {
    expect(oklchToRgb({ l: 1, c: 0, h: 0 })).toEqual([255, 255, 255]);
    expect(oklchToRgb({ l: 0, c: 0, h: 0 })).toEqual([0, 0, 0]);
  });

  it('builds a legend gradient with one stop per step', () => {
    const g = heatGradient();
    expect(g.startsWith('linear-gradient(to right,')).toBe(true);
    expect((g.match(/#[0-9a-f]{6}/g) ?? []).length).toBe(11);
  });
});

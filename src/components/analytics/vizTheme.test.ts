import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/heat';
import { VIZ_DARK, VIZ_LIGHT, type VizTheme } from './vizTheme';

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const css = readFileSync(join(__dirname, '../../index.css'), 'utf8');

describe('chart palette', () => {
  it.each([['light', VIZ_LIGHT], ['dark', VIZ_DARK]] as const)('%s: every value is a valid hex and the six series are distinct', (_n, t: VizTheme) => {
    const all = [t.surface, t.ink, t.inkSecondary, t.muted, t.grid, t.axis, t.neutral, ...Object.values(t.series)];
    for (const c of all) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(Object.values(t.series)).size).toBe(6);
  });

  it('text tokens are readable on their surface (>= 4.5:1), and marks that carry data are >= 3:1 except the documented light-mode relief cases', () => {
    for (const t of [VIZ_LIGHT, VIZ_DARK]) {
      expect(contrastRatio(rgb(t.ink), rgb(t.surface))).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(rgb(t.inkSecondary), rgb(t.surface))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(rgb(t.neutral), rgb(t.surface))).toBeGreaterThanOrEqual(3);
    }
    // the validator's WARN: only aqua and magenta are under 3:1 in light mode (relief = labels + table)
    const under3 = Object.entries(VIZ_LIGHT.series).filter(([, c]) => contrastRatio(rgb(c), rgb(VIZ_LIGHT.surface)) < 3).map(([k]) => k).sort();
    expect(under3).toEqual(['humidity', 'sleep_hours']);
    for (const c of Object.values(VIZ_DARK.series)) expect(contrastRatio(rgb(c), rgb(VIZ_DARK.surface))).toBeGreaterThanOrEqual(3);
  });

  it('the CSS tokens used by the HTML parts match the JS theme (no drift)', () => {
    const light = css.slice(css.indexOf('.viz-root {'), css.indexOf('@media (prefers-color-scheme: dark)', css.indexOf('.viz-root {')));
    const dark = css.slice(css.indexOf('.viz-root {', css.indexOf('@media (prefers-color-scheme: dark)', css.indexOf('.viz-root {'))));
    for (const v of [VIZ_LIGHT.surface, VIZ_LIGHT.ink, VIZ_LIGHT.inkSecondary, VIZ_LIGHT.muted, VIZ_LIGHT.grid, VIZ_LIGHT.axis, VIZ_LIGHT.series.severity]) expect(light).toContain(v);
    for (const v of [VIZ_DARK.surface, VIZ_DARK.ink, VIZ_DARK.inkSecondary, VIZ_DARK.grid, VIZ_DARK.axis, VIZ_DARK.series.severity]) expect(dark).toContain(v);
  });
});

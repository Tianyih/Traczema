/**
 * Severity heat scale: 0 = none (green) -> 10 = severe (red), interpolated in OKLCH so steps look
 * evenly spaced, then converted to sRGB hex (works in every browser). Text on top is always the
 * dark ink colour; the tests verify WCAG AA contrast across the whole scale.
 */
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const HEAT_INK = '#171717';

interface Oklch {
  l: number;
  c: number;
  h: number;
}

function oklchAt(severity: number): Oklch {
  const t = clamp(severity, 0, 10) / 10;
  return {
    // lightness dips gently through the warm middle so yellow/orange stay readable with dark ink
    l: lerp(0.87, 0.7, t),
    c: lerp(0.12, 0.17, t),
    h: lerp(145, 27, t), // green -> yellow -> orange -> red
  };
}

const toLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** OKLCH -> sRGB [0..255], clipped to gamut. */
export function oklchToRgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m_ = Math.pow(l - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s_ = Math.pow(l - 0.0894841775 * a - 1.291485548 * b, 3);
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return [r, g, bl].map((v) => Math.round(clamp(toLinear(clamp(v, 0, 1)), 0, 1) * 255)) as [number, number, number];
}

export const severityRgb = (severity: number): [number, number, number] => oklchToRgb(oklchAt(severity));

const hex = (n: number) => n.toString(16).padStart(2, '0');
export const rgbToHex = ([r, g, b]: [number, number, number]) => `#${hex(r)}${hex(g)}${hex(b)}`;

export const severityColor = (severity: number): string => rgbToHex(severityRgb(severity));

/** CSS gradient covering the full 0..10 scale (for the legend). */
export function heatGradient(steps = 11): string {
  const stops = Array.from({ length: steps }, (_, i) => `${severityColor((i / (steps - 1)) * 10)} ${Math.round((i / (steps - 1)) * 100)}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
export const relativeLuminance = ([r, g, b]: [number, number, number]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio between two sRGB colours. */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Chart colours. Every value is from the validated reference palette (dataviz skill, palette.md) and the
 * six-check validator was run on the exact set and order used here, in both modes:
 *   light  #2a78d6,#eb6834,#1baf7a,#6250d6,#e87ba4,#008300   -> all hard gates PASS
 *   dark   #3987e5,#d95926,#199e70,#9085e9,#d55181,#0ca30c   -> all checks PASS
 * Light mode: aqua (2.74:1) and magenta (2.62:1) are under 3:1 on the surface. The validator's rule is
 * that this REQUIRES a relief channel, so every series here has a visible latest-value label and every
 * chart has a table twin.
 *
 * Colour follows the ENTITY, never its rank: severity is always blue, a track is always its own hue.
 * Mirrored in src/index.css (.viz-root) for HTML elements; a test keeps the two in sync.
 */
import { useEffect, useState } from 'react';

export type VizSeries = 'severity' | 'temperature' | 'humidity' | 'stress' | 'sleep_hours' | 'bedding_days';

export interface VizTheme {
  surface: string;
  ink: string;
  inkSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  /** De-emphasis mark colour for "everything that is not the highlighted series". */
  neutral: string;
  series: Record<VizSeries, string>;
}

export const VIZ_LIGHT: VizTheme = {
  surface: '#fcfcfb',
  ink: '#0b0b0b',
  inkSecondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  neutral: '#898781',
  series: { severity: '#2a78d6', temperature: '#eb6834', humidity: '#1baf7a', stress: '#6250d6', sleep_hours: '#e87ba4', bedding_days: '#008300' },
};

export const VIZ_DARK: VizTheme = {
  surface: '#1a1a19',
  ink: '#f0efec',
  inkSecondary: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  neutral: '#898781',
  series: { severity: '#3987e5', temperature: '#d95926', humidity: '#199e70', stress: '#9085e9', sleep_hours: '#d55181', bedding_days: '#0ca30c' },
};

const QUERY = '(prefers-color-scheme: dark)';

/** The chart theme for the current OS colour scheme (updates live). */
export function useVizTheme(): VizTheme {
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark ? VIZ_DARK : VIZ_LIGHT;
}

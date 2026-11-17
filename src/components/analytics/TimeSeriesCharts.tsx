import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/i18n/LanguageContext';
import type { MessageKey } from '@/i18n';
import { OVERLAY_TRACKS, TRACK_DEFS, type OverlayTrackId } from '@/lib/analytics';
import type { ISODate } from '@/lib/date';
import type { DayFrame } from '@/lib/derive/frames';
import { TipRow } from './BarRows';
import { useVizTheme, type VizSeries, type VizTheme } from './vizTheme';

export const SYNC_ID = 'traczema-time';
export const FLARE_AT = 6;

export interface Row {
  date: ISODate;
  severity: number | null;
  itch: number | null;
  wash: boolean;
  [track: string]: number | boolean | string | null;
}

export function buildRows(frames: readonly DayFrame[]): Row[] {
  return frames.map((f) => {
    const row: Row = { date: f.date, severity: f.severity, itch: f.itch, wash: f.beddingWashedToday === true };
    for (const id of OVERLAY_TRACKS) row[id] = TRACK_DEFS[id as OverlayTrackId].read(f);
    return row;
  });
}

const trackSeries = (id: OverlayTrackId): VizSeries => id as VizSeries;

function axisProps(theme: VizTheme) {
  return { tick: { fill: theme.muted, fontSize: 11 }, axisLine: { stroke: theme.axis }, tickLine: false as const };
}

export interface SeverityChartProps {
  rows: readonly Row[];
  showXAxis: boolean;
}

/** Overall severity over time: ONE series, so no legend box; the card title names it. */
export function SeverityChart({ rows, showXAxis }: SeverityChartProps) {
  const { t, formatDate } = useLanguage();
  const theme = useVizTheme();
  const color = theme.series.severity;
  const last = useMemo(() => [...rows].reverse().find((r) => r.severity !== null), [rows]);
  const washes = useMemo(() => rows.filter((r) => r.wash), [rows]);
  const isolated = (i: number) => rows[i]?.severity !== null && rows[i - 1]?.severity == null && rows[i + 1]?.severity == null;

  return (
    <div data-testid="severity-chart" role="img" aria-label={t('chart_series_aria', { name: t('chart_severity_title'), n: rows.length })} style={{ height: showXAxis ? 256 : 232 }}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 240 }}>
        <ComposedChart data={rows as Row[]} syncId={SYNC_ID} margin={{ top: 14, right: 18, bottom: 8, left: 0 }}>
          <CartesianGrid vertical={false} stroke={theme.grid} strokeWidth={1} />
          <XAxis dataKey="date" hide={!showXAxis} {...axisProps(theme)} tickFormatter={(d: ISODate) => formatDate(d, 'fmt_chart_tick')} interval="preserveStartEnd" minTickGap={28} />
          <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} interval={0} width={28} {...axisProps(theme)} axisLine={false} />
          <ReferenceLine y={FLARE_AT} stroke={theme.muted} strokeWidth={1} />
          {washes.map((w) => (
            <ReferenceLine key={w.date} x={w.date} stroke={theme.axis} strokeWidth={1} />
          ))}
          <Tooltip
            cursor={{ stroke: theme.muted, strokeWidth: 1 }}
            isAnimationActive={false}
            content={(p) => {
              const row = (p.payload as readonly { payload?: Row }[] | undefined)?.[0]?.payload;
              if (!p.active || !row) return null;
              return (
                <div className="viz-root rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: theme.surface }}>
                  <p className="mb-1 text-[11px] text-[var(--viz-ink-2)]">{formatDate(row.date, 'fmt_full_date')}</p>
                  <TipRow keyColor={color} value={row.severity === null ? '—' : `${row.severity}/10`} label={t('chart_severity_title')} />
                  {row.itch !== null && <TipRow value={`${row.itch}/10`} label={t('var_itch')} />}
                  {row.wash && <p className="mt-1 text-[var(--viz-ink-2)]">{t('chart_wash_marker')}</p>}
                </div>
              );
            }}
          />
          <Area dataKey="severity" stroke="none" fill={color} fillOpacity={0.1} connectNulls={false} isAnimationActive={false} activeDot={false} legendType="none" />
          <Line
            dataKey="severity"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            connectNulls={false}
            isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.cx !== undefined && p.cy !== undefined && p.index !== undefined && isolated(p.index) ? (
                <circle key={`d${p.index}`} cx={p.cx} cy={p.cy} r={4} fill={color} stroke={theme.surface} strokeWidth={2} />
              ) : (
                <g key={`d${p.index}`} />
              )
            }
            activeDot={{ r: 4, fill: color, stroke: theme.surface, strokeWidth: 2 }}
          />
          {last && (
            <ReferenceDot x={last.date} y={last.severity as number} r={5} fill={color} stroke={theme.surface} strokeWidth={2} ifOverflow="visible"
              label={{ value: String(last.severity), position: 'top', fill: theme.ink, fontSize: 12, fontWeight: 600 }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface TrackChartProps {
  id: OverlayTrackId;
  rows: readonly Row[];
  showXAxis: boolean;
}

/** One overlay track with its OWN scale (no shared or hidden second axis), aligned by date to the chart above. */
export function TrackChart({ id, rows, showXAxis }: TrackChartProps) {
  const { t, formatDate, formatNumber } = useLanguage();
  const theme = useVizTheme();
  const def = TRACK_DEFS[id];
  const color = theme.series[trackSeries(id)];
  const unit = t(`unit_${def.unit}` as MessageKey);
  const text = (v: number) => `${formatNumber(v, { maximumFractionDigits: 1 })}${unit}`;
  const last = useMemo(() => [...rows].reverse().find((r) => r[id] !== null), [rows, id]);
  const name = t(def.labelKey as MessageKey);

  return (
    <div data-testid={`track-${id}`} data-track={id} className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-3 px-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <span aria-hidden className="h-0.5 w-4 rounded" style={{ background: color }} />
          {name}
        </span>
        <span className="text-xs text-[var(--viz-ink-2)]" data-testid={`track-${id}-latest`}>
          {last ? t('chart_latest', { value: text(last[id] as number) }) : t('chart_no_data')}
        </span>
      </div>
      <div role="img" aria-label={t('chart_series_aria', { name, n: rows.length })} style={{ height: showXAxis ? 118 : 90 }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 100 }}>
          <LineChart data={rows as Row[]} syncId={SYNC_ID} margin={{ top: 6, right: 18, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={theme.grid} strokeWidth={1} />
            <XAxis dataKey="date" hide={!showXAxis} {...axisProps(theme)} tickFormatter={(d: ISODate) => formatDate(d, 'fmt_chart_tick')} interval="preserveStartEnd" minTickGap={28} />
            <YAxis domain={['auto', 'auto']} width={36} tickCount={3} {...axisProps(theme)} axisLine={false} tickFormatter={(v: number) => formatNumber(Math.round(v * 10) / 10)} />
            <Tooltip
              cursor={{ stroke: theme.muted, strokeWidth: 1 }}
              isAnimationActive={false}
              content={(p) => {
                const row = (p.payload as readonly { payload?: Row }[] | undefined)?.[0]?.payload;
                if (!p.active || !row) return null;
                const v = row[id] as number | null;
                return (
                  <div className="viz-root rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: theme.surface }}>
                    <p className="mb-1 text-[11px] text-[var(--viz-ink-2)]">{formatDate(row.date, 'fmt_full_date')}</p>
                    <TipRow keyColor={color} value={v === null ? '—' : text(v)} label={name} />
                  </div>
                );
              }}
            />
            <Line dataKey={id} type={id === 'bedding_days' ? 'stepAfter' : 'monotone'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" connectNulls={false} isAnimationActive={false} dot={false} activeDot={{ r: 4, fill: color, stroke: theme.surface, strokeWidth: 2 }} />
            {last && <ReferenceDot x={last.date} y={last[id] as number} r={4} fill={color} stroke={theme.surface} strokeWidth={2} ifOverflow="visible" />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Table twin of the charts: every plotted value, reachable without hover. */
export function SeriesTable({ rows, tracks }: { rows: readonly Row[]; tracks: readonly OverlayTrackId[] }) {
  const { t, formatDate, formatNumber } = useLanguage();
  return (
    <details className="mt-3 text-sm" data-testid="series-table">
      <summary className="cursor-pointer text-xs font-medium text-[var(--viz-ink-2)]">{t('chart_table_toggle')}</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-md border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-[var(--viz-surface)]">
            <tr className="border-b">
              <th className="px-2 py-1.5 font-medium">{t('chart_table_col_date')}</th>
              <th className="px-2 py-1.5 font-medium">{t('var_severity')}</th>
              <th className="px-2 py-1.5 font-medium">{t('var_itch')}</th>
              {tracks.map((id) => (
                <th key={id} className="px-2 py-1.5 font-medium">{t(TRACK_DEFS[id].labelKey as MessageKey)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={r.date} className="border-b last:border-0">
                <td className="px-2 py-1">{formatDate(r.date, 'fmt_date_year')}</td>
                <td className="px-2 py-1">{r.severity ?? '—'}</td>
                <td className="px-2 py-1">{r.itch ?? '—'}</td>
                {tracks.map((id) => (
                  <td key={id} className="px-2 py-1">{r[id] === null ? '—' : formatNumber(r[id] as number, { maximumFractionDigits: 1 })}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

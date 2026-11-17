import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import type { CustomRef } from '@/db/types';
import { useLanguage } from '@/i18n/LanguageContext';
import type { MessageKey } from '@/i18n';
import { formatFactorValue } from '@/i18n/format';
import { alignFrames, forwardAnalysis, type Variable, type VariableGroup } from '@/lib/analytics';
import { forwardRows, rangeStart, type AnalyticsParams } from '@/lib/analytics/view';
import { todayISO } from '@/lib/date';
import type { DayFrame } from '@/lib/derive/frames';
import { BarRows, LegendKey, TipRow, VizCard, type BarDatum } from './BarRows';
import { SpreadGlyph } from './SpreadGlyph';
import { WarningList } from './WarningList';

const GROUP_ORDER: VariableGroup[] = ['bedding', 'stress_sleep', 'weather', 'exercise', 'shower', 'diet', 'clothing'];

export function ForwardExplorer({ frames, registry, params, onChange, customLabels }: { frames: readonly DayFrame[]; registry: readonly Variable[]; params: AnalyticsParams; onChange: (patch: Partial<AnalyticsParams>) => void; customLabels: ReadonlyMap<CustomRef, string> }) {
  const tr = useLanguage();
  const { t, tn, formatNumber } = tr;
  const variable = registry.find((v) => v.id === params.variable) ?? (registry[0] as Variable);

  const opts = useMemo(() => ({ lag: params.lag, from: rangeStart(params.range, todayISO()), onsetOnly: params.onset }), [params.lag, params.range, params.onset]);
  const result = useMemo(() => forwardAnalysis(alignFrames(frames, opts), variable, opts), [frames, variable, opts]);
  const rows = useMemo(() => forwardRows(result), [result]);
  const minDays = 5;

  const f1 = (v: number | null) => (v === null ? '—' : formatNumber(v, { maximumFractionDigits: 1 }));
  const pctText = (v: number | null) => (v === null ? '—' : formatNumber(v, { style: 'percent', maximumFractionDigits: 0 }));
  const pText = (p: number | null) => (p === null ? '—' : p < 0.001 ? '<0.001' : formatNumber(p, { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
  const pCmp = (p: number) => (p < 0.001 ? '< 0.001' : `= ${formatNumber(p, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`);
  const levelLabel = (i: number) => formatFactorValue(tr, rows[i]!.level.value, customLabels);

  const labelNode = (i: number) => {
    const r = rows[i]!;
    return (
      <span className="flex flex-col">
        <span>{levelLabel(i)}</span>
        <span className="text-[11px] text-[var(--viz-muted)]">{r.n === 0 ? t('fwd_empty_level') : tn('days', r.n)}</span>
      </span>
    );
  };

  const meanRows: BarDatum[] = rows.map((r, i) => ({
    key: r.factorKey, value: r.mean, valueText: f1(r.mean), accent: r.exceedsMean, marker: r.median, label: labelNode(i),
    ariaLabel: `${levelLabel(i)}: ${t('fwd_col_mean')} ${f1(r.mean)}, ${t('fwd_col_median')} ${f1(r.median)}, ${tn('days', r.n)}${r.exceedsMean ? `, ${t('fwd_above')}` : ''}`,
    attrs: { factor: r.factorKey, n: r.n, mean: r.mean ?? '', exceeds: r.exceedsMean },
    tooltip: (
      <div className="space-y-0.5">
        <p className="mb-1 font-medium text-[var(--viz-ink)]">{levelLabel(i)}</p>
        <TipRow value={f1(r.mean)} label={t('fwd_col_mean')} />
        <TipRow value={f1(r.median)} label={t('fwd_col_median')} />
        <TipRow value={tn('days', r.n)} label="" />
        {r.exceedsMean && <p className="mt-1 font-medium text-[var(--viz-ink)]">▲ {t('fwd_above')}</p>}
      </div>
    ),
  }));

  const flareRows: BarDatum[] = rows.map((r, i) => ({
    key: r.factorKey, value: r.flareProb, valueText: pctText(r.flareProb), accent: r.exceedsFlare, label: labelNode(i),
    ariaLabel: `${levelLabel(i)}: ${t('fwd_col_flare')} ${pctText(r.flareProb)}${r.exceedsFlare ? `, ${t('fwd_above')}` : ''}`,
    attrs: { factor: r.factorKey, n: r.n, flare: r.flareProb ?? '', exceeds: r.exceedsFlare },
    tooltip: (
      <div className="space-y-0.5">
        <p className="mb-1 font-medium text-[var(--viz-ink)]">{levelLabel(i)}</p>
        <TipRow value={pctText(r.flareProb)} label={t('fwd_col_flare')} />
        {r.level.flareCI && <TipRow value={`${pctText(r.level.flareCI[0])} – ${pctText(r.level.flareCI[1])}`} label={t('fwd_col_ci')} />}
        {r.exceedsFlare && <p className="mt-1 font-medium text-[var(--viz-ink)]">▲ {t('fwd_above')}</p>}
      </div>
    ),
  }));

  const baseMean = result.baseline.mean;
  const baseFlare = result.baseline.flareProb;
  const groups = GROUP_ORDER.map((g) => ({ g, vars: registry.filter((v) => v.group === g) })).filter((x) => x.vars.length > 0);

  return (
    <div className="space-y-4" data-testid="forward-explorer" data-lag={result.lag}>
      <div className="rounded-xl border bg-card p-3">
        <label htmlFor="forward-variable" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('fwd_pick')}</label>
        <select
          id="forward-variable"
          data-testid="forward-variable"
          value={variable.id}
          onChange={(e) => onChange({ variable: e.target.value as AnalyticsParams['variable'] })}
          className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm sm:max-w-sm"
        >
          {groups.map(({ g, vars }) => (
            <optgroup key={g} label={t(`group_${g}` as MessageKey)}>
              {vars.map((v) => (
                <option key={v.id} value={v.id}>{t(v.labelKey as MessageKey)}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="mt-2 text-xs text-muted-foreground">{t('fwd_days_known', { n: result.baseline.n })}</p>
      </div>

      <WarningList warnings={result.warnings} />

      <VizCard testId="forward-mean-card" title={t('fwd_mean_chart')} subtitle={t('fwd_highlight_hint', { min: minDays })}>
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="legend" data-testid="forward-legend">
          <LegendKey kind="bar" color="var(--viz-severity)">{t('fwd_above')}</LegendKey>
          <LegendKey kind="bar" color="var(--viz-neutral)">{t('fwd_vs_below')}</LegendKey>
          <LegendKey kind="dot" color="var(--viz-ink)">{t('fwd_legend_median')}</LegendKey>
          <LegendKey kind="line" color="var(--viz-ink-2)">{t('fwd_legend_baseline')}</LegendKey>
        </ul>
        {result.baseline.n === 0 ? (
          <p className="text-sm text-[var(--viz-ink-2)]">{t('chart_no_data')}</p>
        ) : (
          <BarRows
            testId="forward-mean-bars"
            rows={meanRows}
            max={10}
            reference={baseMean === null ? null : { at: baseMean, label: t('fwd_baseline_value', { value: f1(baseMean) }) }}
            ticks={[0, 2, 4, 6, 8, 10].map((v) => ({ at: v, label: String(v) }))}
          />
        )}
      </VizCard>

      <VizCard testId="forward-flare-card" title={t('fwd_flare_chart')}>
        {result.baseline.n === 0 ? (
          <p className="text-sm text-[var(--viz-ink-2)]">{t('chart_no_data')}</p>
        ) : (
          <BarRows
            testId="forward-flare-bars"
            rows={flareRows}
            max={1}
            reference={baseFlare === null ? null : { at: baseFlare, label: t('fwd_baseline_value', { value: pctText(baseFlare) }) }}
            ticks={[0, 0.25, 0.5, 0.75, 1].map((v) => ({ at: v, label: pctText(v) }))}
          />
        )}
      </VizCard>

      {result.trend && (
        <p data-testid="forward-trend" className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="size-4" aria-hidden />
          {t('fwd_trend', { rho: formatNumber(result.trend.rho, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), p: pCmp(result.trend.p), n: result.trend.n })}
        </p>
      )}

      {/* table twin of both charts */}
      <div className="viz-root overflow-x-auto rounded-xl border" data-testid="forward-table">
        <table className="w-full min-w-[40rem] text-left text-xs">
          <thead>
            <tr className="border-b">
              {(['fwd_col_level', 'fwd_col_days', 'fwd_col_mean', 'fwd_col_median', 'fwd_col_spread', 'fwd_col_flare', 'fwd_col_ci', 'fwd_col_vs', 'fwd_col_sig'] as const).map((k) => (
                <th key={k} className="px-3 py-2 font-medium">{t(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r, i) => (
              <tr key={r.factorKey} data-testid="forward-row" data-factor={r.factorKey} data-n={r.n} data-exceeds={r.exceedsMean} className="border-b last:border-0">
                <td className="px-3 py-1.5 font-sans">{levelLabel(i)}</td>
                <td className="px-3 py-1.5">{r.n}</td>
                <td className="px-3 py-1.5">{f1(r.mean)}</td>
                <td className="px-3 py-1.5">{f1(r.median)}</td>
                <td className="px-3 py-1.5"><SpreadGlyph level={r.level} label={`${levelLabel(i)}: ${t('fwd_col_spread')}`} /></td>
                <td className="px-3 py-1.5">{pctText(r.flareProb)}</td>
                <td className="px-3 py-1.5">{r.level.flareCI ? `${pctText(r.level.flareCI[0])} – ${pctText(r.level.flareCI[1])}` : '—'}</td>
                <td className="px-3 py-1.5 font-sans">{r.n === 0 ? '—' : r.exceedsMean ? <strong>▲ {t('fwd_vs_above')}</strong> : t('fwd_vs_below')}</td>
                <td className="px-3 py-1.5">{r.level.p === null ? '—' : `${pText(r.level.p)} / ${pText(r.level.q)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

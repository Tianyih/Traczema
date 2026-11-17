import { useMemo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { MessageKey } from '@/i18n';
import { formatFactorLabel } from '@/i18n/format';
import { alignFrames, LAGS, rankTriggerImpact, type FactorDef } from '@/lib/analytics';
import type { AnalyticsParams } from '@/lib/analytics/view';
import { rangeStart } from '@/lib/analytics/view';
import { todayISO } from '@/lib/date';
import type { DayFrame } from '@/lib/derive/frames';
import type { CustomRef } from '@/db/types';
import { BarRows, TipRow, VizCard, type BarDatum } from './BarRows';
import { EvidenceBadge } from './EvidenceBadge';
import { WarningList } from './WarningList';

export const TOP_TRIGGERS = 8;

/** Ranked Trigger Impact: which factors are most over-represented on flare days (severity 6+). */
export function TriggerRanking({ frames, factors, params, customLabels }: { frames: readonly DayFrame[]; factors: readonly FactorDef[]; params: AnalyticsParams; customLabels: ReadonlyMap<CustomRef, string> }) {
  const tr = useLanguage();
  const { t, formatNumber } = tr;
  const result = useMemo(() => {
    const opts = { lag: params.lag, from: rangeStart(params.range, todayISO()), onsetOnly: params.onset };
    return rankTriggerImpact(alignFrames(frames, opts), factors, opts);
  }, [frames, factors, params.lag, params.range, params.onset]);

  const top = result.ranked.slice(0, TOP_TRIGGERS);
  const maxLift = Math.max(2, Math.ceil(Math.max(...top.map((r) => r.lift), 0) * 1.05));
  const x = (v: number) => formatNumber(v, { maximumFractionDigits: 1 });

  const rows: BarDatum[] = top.map((r, i) => {
    const label = formatFactorLabel(tr, r.variableLabelKey, r.value, customLabels);
    return {
      key: r.factorKey,
      value: r.lift,
      valueText: `${x(r.lift)}×`,
      accent: r.evidence === 'strong' || r.evidence === 'moderate',
      label: (
        <span className="flex flex-col items-start gap-1">
          <span><span className="mr-1 text-[var(--viz-muted)] tabular-nums">{i + 1}.</span>{label}</span>
          <EvidenceBadge evidence={r.evidence} />
        </span>
      ),
      ariaLabel: `${i + 1}. ${label}: ${x(r.lift)}×, ${t(`evidence_${r.evidence}` as MessageKey)}`,
      attrs: { factor: r.factorKey, lift: r.lift, evidence: r.evidence, rank: i + 1 },
      tooltip: (
        <div className="space-y-0.5">
          <TipRow value={`${x(r.lift)}×`} label={label} />
          <TipRow value={formatNumber(r.coOccurrenceRate, { style: 'percent', maximumFractionDigits: 0 })} label={t('rev_bar_group')} />
          <TipRow value={formatNumber(r.baselineRate, { style: 'percent', maximumFractionDigits: 0 })} label={t('rev_bar_all')} />
        </div>
      ),
    };
  });

  return (
    <VizCard testId="trigger-ranking" title={t('trig_title')} subtitle={t('trig_subtitle', { lag: t(LAGS[params.lag].labelKey as MessageKey) })}>
      <div className="space-y-3" data-testid="trigger-body" data-lag={result.lag}>
        <WarningList warnings={result.warnings} />
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--viz-ink-2)]" data-testid="trigger-empty">{t('trig_empty')}</p>
        ) : (
          <BarRows
            testId="trigger-rows"
            rows={rows}
            max={maxLift}
            reference={{ at: 1, label: t('lift_scale_note') }}
            ticks={Array.from({ length: maxLift + 1 }, (_, i) => ({ at: i, label: `${i}×` }))}
            labelWidth="12rem"
          />
        )}
      </div>
    </VizCard>
  );
}

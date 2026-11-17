import { useMemo, useState } from 'react';
import { REGION_IDS, type CustomRef, type RegionId } from '@/db/types';
import { useLanguage } from '@/i18n/LanguageContext';
import type { MessageKey } from '@/i18n';
import { formatFactorLabel } from '@/i18n/format';
import { alignFrames, reverseAnalysis, SEVERITY_TIERS, type FactorDef, type FactorResult, type SeverityTier } from '@/lib/analytics';
import { rangeStart, type AnalyticsParams } from '@/lib/analytics/view';
import { todayISO } from '@/lib/date';
import type { DayFrame } from '@/lib/derive/frames';
import { Segmented } from '@/components/daily-log/fields';
import { EvidenceBadge } from './EvidenceBadge';
import { WarningList } from './WarningList';

export const INITIAL_SHOWN = 12;

/** A thin percentage bar on a fixed 0-100% scale. */
function PctBar({ value, accent, label }: { value: number; accent: boolean; label: string }) {
  return (
    <span className="relative block h-2 w-full rounded-r-[4px] bg-[var(--viz-grid)]" role="img" aria-label={label}>
      <span className="absolute inset-y-0 left-0 block rounded-r-[4px]" style={{ width: `${Math.min(100, value * 100)}%`, minWidth: value > 0 ? 2 : 0, background: accent ? 'var(--viz-severity)' : 'var(--viz-neutral)' }} />
    </span>
  );
}

function FactorCard({ f, rank, tier, tierLabel, customLabels, less }: { f: FactorResult; rank: number; tier: SeverityTier; tierLabel: string; customLabels: ReadonlyMap<CustomRef, string>; less?: boolean }) {
  const tr = useLanguage();
  const { t, formatNumber } = tr;
  const pct = (v: number) => formatNumber(v, { style: 'percent', maximumFractionDigits: 0 });
  const n2 = (v: number) => formatNumber(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // comparator included so it reads "p < 0.001" / "p = 0.015"
  const p3 = (p: number) => (p < 0.001 ? '< 0.001' : `= ${formatNumber(p, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`);
  const label = formatFactorLabel(tr, f.variableLabelKey, f.value, customLabels);
  const lift = n2(f.lift);
  const co = t('rev_cooccurrence', { pct: pct(f.coOccurrenceRate), tier: tierLabel, both: f.counts.both, target: f.counts.targetDays });
  const base = t('rev_baseline', { pct: pct(f.baselineRate), present: f.counts.factorDays, total: f.counts.N });

  return (
    <li
      data-testid="reverse-row"
      data-factor={f.factorKey}
      data-tier={tier}
      data-lift={f.lift}
      data-co={f.coOccurrenceRate}
      data-base={f.baselineRate}
      data-evidence={f.evidence}
      data-rank={rank}
      className="viz-root space-y-3 rounded-xl border p-3"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="mt-0.5 min-w-6 text-sm tabular-nums text-[var(--viz-muted)]">{rank}.</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{label}</p>
          <div className="mt-1"><EvidenceBadge evidence={f.evidence} /></div>
        </div>
        <p className="rounded-lg border border-[var(--viz-ink)] px-2.5 py-1 text-sm font-semibold" data-testid="lift-chip">
          {t(less ? 'rev_lift_less' : 'rev_lift_text', { lift })}
        </p>
      </div>

      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-start">
        <span className="text-xs leading-none text-[var(--viz-ink-2)] sm:pt-px">{t('rev_bar_group')}</span>
        <div className="space-y-1">
          <PctBar value={f.coOccurrenceRate} accent label={co} />
          <p className="text-xs text-[var(--viz-ink-2)]" data-testid="co-text">{co}</p>
        </div>
        <span className="text-xs leading-none text-[var(--viz-ink-2)] sm:pt-px">{t('rev_bar_all')}</span>
        <div className="space-y-1">
          <PctBar value={f.baselineRate} accent={false} label={base} />
          <p className="text-xs text-[var(--viz-ink-2)]" data-testid="base-text">{base}</p>
        </div>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs text-[var(--viz-ink-2)]" style={{ borderColor: 'var(--viz-grid)' }}>
        <span data-testid="formula" className="font-semibold text-[var(--viz-ink)]">{t('rev_formula', { co: pct(f.coOccurrenceRate), base: pct(f.baselineRate), lift })}</span>
        <span>{t('rev_phi', { phi: n2(f.phi) })}</span>
        {f.relativeRisk !== null && <span>{t('rev_rr', { rr: n2(f.relativeRisk) })}</span>}
        <span>{t('rev_sig', { p: p3(f.pValue), q: f.qValue === null ? '—' : p3(f.qValue) })}</span>
      </p>
    </li>
  );
}

export function ReverseExplorer({ frames, factors, params, onChange, customLabels }: { frames: readonly DayFrame[]; factors: readonly FactorDef[]; params: AnalyticsParams; onChange: (patch: Partial<AnalyticsParams>) => void; customLabels: ReadonlyMap<CustomRef, string> }) {
  const tr = useLanguage();
  const { t, formatNumber } = tr;
  const [showAll, setShowAll] = useState(false);

  const opts = useMemo(() => ({ lag: params.lag, regionId: params.region, from: rangeStart(params.range, todayISO()), onsetOnly: params.onset }), [params.lag, params.region, params.range, params.onset]);
  const result = useMemo(() => reverseAnalysis(alignFrames(frames, opts), factors, params.tier, opts), [frames, factors, params.tier, opts]);
  const tierLabel = t(`tier_${params.tier}` as MessageKey);
  const shown = showAll ? result.ranked : result.ranked.slice(0, INITIAL_SHOWN);

  return (
    <div className="space-y-4" data-testid="reverse-explorer" data-lag={result.lag} data-n={result.N} data-target-days={result.targetDays}>
      <div className="grid gap-3 rounded-xl border bg-card p-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('rev_tier')}</p>
          <Segmented<SeverityTier>
            testId="tier-select"
            ariaLabel={t('rev_tier')}
            value={params.tier}
            onChange={(v) => v && onChange({ tier: v })}
            options={SEVERITY_TIERS.map((s) => ({ value: s, label: t(`tier_${s}` as MessageKey) }))}
          />
        </div>
        <div>
          <label htmlFor="reverse-region" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('rev_region')}</label>
          <select
            id="reverse-region"
            data-testid="region-select"
            value={params.region ?? ''}
            onChange={(e) => onChange({ region: (e.target.value || null) as RegionId | null })}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">{t('rev_region_all')}</option>
            {REGION_IDS.map((r) => (
              <option key={r} value={r}>{t(`region_${r}`)}</option>
            ))}
          </select>
        </div>
        {params.region && <p className="text-xs text-muted-foreground lg:col-span-2">{t('rev_region_note')}</p>}
      </div>

      <p className="text-sm text-muted-foreground" data-testid="reverse-summary">{t('rev_summary', { target: result.targetDays, total: result.N })}</p>
      <WarningList warnings={result.warnings} />

      {result.ranked.length === 0 ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" data-testid="reverse-empty">{t('rev_none')}</p>
      ) : (
        <ol className="space-y-3" data-testid="reverse-list">
          {shown.map((f, i) => (
            <FactorCard key={f.factorKey} f={f} rank={i + 1} tier={params.tier} tierLabel={tierLabel} customLabels={customLabels} />
          ))}
        </ol>
      )}
      {result.ranked.length > INITIAL_SHOWN && (
        <button type="button" data-testid="reverse-toggle" onClick={() => setShowAll((s) => !s)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {showAll ? t('rev_show_less') : t('rev_show_all', { n: result.ranked.length })}
        </button>
      )}

      {result.protective.length > 0 && (
        <details className="rounded-xl border bg-card p-3" data-testid="reverse-protective">
          <summary className="cursor-pointer text-sm font-medium">{t('rev_protective_title')} ({result.protective.length})</summary>
          <ol className="mt-3 space-y-3">
            {result.protective.slice(0, INITIAL_SHOWN).map((f, i) => (
              <FactorCard key={f.factorKey} f={f} rank={i + 1} tier={params.tier} tierLabel={tierLabel} customLabels={customLabels} less />
            ))}
          </ol>
        </details>
      )}

      {result.insufficient.length > 0 && (
        <details className="rounded-xl border bg-card p-3" data-testid="reverse-insufficient">
          <summary className="cursor-pointer text-sm font-medium">{t('rev_insufficient_title')} ({result.insufficient.length})</summary>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {result.insufficient.map((f) => (
              <li key={f.factorKey} className="flex flex-wrap gap-x-3">
                <span className="font-medium text-foreground">{formatFactorLabel(tr, f.variableLabelKey, f.value, customLabels)}</span>
                <span>{t('rev_baseline', { pct: formatNumber(f.baselineRate, { style: 'percent', maximumFractionDigits: 0 }), present: f.counts.factorDays, total: f.counts.N })}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

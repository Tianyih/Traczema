import { Switch } from '@/components/ui/switch';
import { Segmented } from '@/components/daily-log/fields';
import { useLanguage } from '@/i18n/LanguageContext';
import type { MessageKey } from '@/i18n';
import { LAG_IDS, LAGS, type LagId } from '@/lib/analytics';
import { RANGE_PRESETS, type AnalyticsParams, type RangePreset } from '@/lib/analytics/view';

/**
 * The single filter row above every chart (never inside a card, never per chart). Everything below it
 * re-renders against the same slice, so the numbers always agree.
 */
export function AnalyticsFilters({ params, onChange }: { params: AnalyticsParams; onChange: (patch: Partial<AnalyticsParams>) => void }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3" data-testid="analytics-filters">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('filter_range')}</p>
          <Segmented<RangePreset>
            testId="range-select"
            ariaLabel={t('filter_range')}
            value={params.range}
            onChange={(v) => v && onChange({ range: v })}
            options={RANGE_PRESETS.map((r) => ({ value: r, label: t(`range_${r}` as MessageKey) }))}
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('filter_lag')}</p>
          <Segmented<LagId>
            testId="lag-select"
            ariaLabel={t('filter_lag')}
            value={params.lag}
            onChange={(v) => v && onChange({ lag: v })}
            options={LAG_IDS.map((id) => ({ value: id, label: t(LAGS[id].labelKey as MessageKey) }))}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="lag-help" aria-live="polite">{t(`lag_help_${params.lag}` as MessageKey)}</p>
      <label className="flex items-start gap-3 text-sm">
        <Switch data-testid="onset-toggle" checked={params.onset} onCheckedChange={(c) => onChange({ onset: c })} className="mt-0.5" />
        <span>
          <span className="font-medium">{t('filter_onset')}</span>
          <span className="block text-xs text-muted-foreground">{t('filter_onset_help')}</span>
        </span>
      </label>
    </div>
  );
}

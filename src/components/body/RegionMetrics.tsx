import { useLanguage } from '@/i18n/LanguageContext';
import type { RegionSummary } from '@/lib/derive/regionTimeline';
import { cn } from '@/lib/utils';

function Metric({ id, label, value, raw, sub, emphasis }: { id: string; label: string; value: string; raw: number | null; sub?: string; emphasis?: boolean }) {
  return (
    <div data-testid={`metric-${id}`} data-value={raw ?? ''} className={cn('rounded-lg border bg-card p-3', emphasis && 'border-primary/40 bg-accent/40')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * Days affected, recurrences and remission. Every number here is DERIVED from the observation history
 * (`deriveRegionSummary`); there is nothing to type.
 */
export function RegionMetrics({ summary }: { summary: RegionSummary }) {
  const { t, tn, formatNumber } = useLanguage();
  const ep = summary.currentEpisode;
  const none = t('metric_none');
  const days = (n: number | null) => (n === null ? none : tn('days', Math.round(n)));
  const avg = summary.avgRemissionDays;

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="region-metrics">
        <Metric
          id="days-affected"
          emphasis={ep !== null}
          label={t('metric_days_affected')}
          value={ep ? tn('days', summary.currentEpisodeDays) : none}
          raw={ep ? summary.currentEpisodeDays : null}
          sub={ep ? `${t('episode_active_days', { days: ep.daysActive })} · ${t('episode_healing_days', { days: ep.daysHealing })}` : undefined}
        />
        <Metric id="cumulative" label={t('metric_cumulative')} value={tn('days', summary.cumulativeDaysAffected)} raw={summary.cumulativeDaysAffected} />
        <Metric id="recurrences" label={t('metric_recurrences')} value={String(summary.recurrenceCount)} raw={summary.recurrenceCount} />
        <Metric id="avg-remission" label={t('metric_avg_remission')} value={avg === null ? none : tn('days', Math.round(avg))} raw={avg === null ? null : Number(formatNumber(avg, { maximumFractionDigits: 1 }).replace(/,/g, ''))} />
        <Metric id="episodes" label={t('metric_episodes')} value={String(summary.episodeCount)} raw={summary.episodeCount} />
        <Metric id="in-remission" label={t('metric_in_remission')} value={days(summary.daysInRemission)} raw={summary.daysInRemission} />
      </dl>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {ep && (
          <span data-testid="episode-badge" className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
            {ep.isRecurrence ? t('metric_recurrence_badge', { n: ep.index - 1 }) : t('metric_first_episode')}
          </span>
        )}
        <span>{t('metric_hint_derived')}</span>
      </div>
    </div>
  );
}
